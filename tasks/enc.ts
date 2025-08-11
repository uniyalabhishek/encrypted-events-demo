import { task } from "hardhat/config";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";
import { x25519 } from "@noble/curves/ed25519";
import { mraeDeoxysii } from "@oasisprotocol/client-rt";

/**
 * Unified command:
 *   EMIT (key):   npx hardhat enc --network <net> --action emit    --mode key  --contract <ADDR> [--message "..."] [--key <HEX32>] [--aad]
 *   EMIT (ecdh):  npx hardhat enc --network <net> --action emit    --mode ecdh --contract <ADDR> [--message "..."] [--secret <HEX32>] [--aad]
 *   LISTEN (key): npx hardhat enc --network <net> --action listen  --mode key  --contract <ADDR> --key <HEX32> [--aad]
 *   LISTEN (ecdh):npx hardhat enc --network <net> --action listen  --mode ecdh --contract <ADDR> --secret <HEX32> [--aad]
 *   DECRYPT (key):npx hardhat enc --network <net> --action decrypt --mode key  [--contract <ADDR>] --tx <TX_HASH> --key <HEX32> [--aad]
 *   DECRYPT (ecdh):npx hardhat enc --network <net> --action decrypt --mode ecdh --contract <ADDR> --tx <TX_HASH> --secret <HEX32> [--aad]
 *
 * Event signature (both contracts):
 *   event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);
 */
task("enc", "Unified emit/listen/decrypt for encrypted events (key|ecdh)")
  .addParam("action", "emit | listen | decrypt")
  .addParam("mode", "key | ecdh")
  .addOptionalParam("contract", "Contract address")
  .addOptionalParam("message", "Plaintext to encrypt (emit)", "Hello Sapphire 👋")
  .addOptionalParam("key", "Hex-encoded 32-byte symmetric key (key mode)")
  .addOptionalParam("secret", "Hex-encoded 32-byte caller Curve25519 secret (ecdh mode)")
  .addOptionalParam("tx", "Transaction hash containing the Encrypted event (decrypt)")
  .addFlag("aad", "Bind/decode with abi.encodePacked(msg.sender)")
  .setAction(async ({ action, mode, contract, message, key, secret, tx, aad }, hre) => {
    const { ethers } = hre;

    if (!["emit", "listen", "decrypt"].includes(action)) {
      throw new Error("action must be 'emit', 'listen', or 'decrypt'");
    }
    if (!["key", "ecdh"].includes(mode)) {
      throw new Error("mode must be 'key' or 'ecdh'");
    }
    if ((action === "emit" || action === "listen") && !contract) {
      throw new Error("--contract is required for 'emit' and 'listen'");
    }
    if (action === "decrypt" && mode === "ecdh" && !contract) {
      throw new Error("--contract is required for decrypt in ecdh mode");
    }

    /* ---------------------------------------------------------------
     * EMIT
     * ------------------------------------------------------------- */
    if (action === "emit") {
      if (mode === "key") {
        const instance = await ethers.getContractAt("EncryptedEvents", contract as string);
        const keyHex = (key as `0x${string}`) ?? (ethers.hexlify(ethers.randomBytes(32)) as `0x${string}`);
        const data = ethers.hexlify(ethers.toUtf8Bytes(message));
        const txr = aad
          ? await (instance as any).emitEncryptedWithAad(keyHex, data)
          : await instance.emitEncrypted(keyHex, data);
        const receipt = await txr.wait();
        console.log("Encrypted event emitted in tx:", receipt?.hash);
        console.log("Symmetric key (hex):", keyHex);
        if (aad) {
          console.log("AAD used: abi.encodePacked(msg.sender)");
          console.warn("Note: AAD binds to msg.sender (emitted as the first event arg). Use that same value when decrypting.");
        }
        return;
      }

      // ECDH emit
      const instance = await ethers.getContractAt("EncryptedEventsECDH", contract as string);
      const callerSecret = secret ? ethers.getBytes(secret) : ethers.randomBytes(32);
      if (callerSecret.length !== 32) throw new Error("Caller secret must be 32 bytes");
      const callerPublic = x25519.getPublicKey(callerSecret);
      const callerPkHex = ethers.hexlify(callerPublic) as `0x${string}`;
      const data = ethers.hexlify(ethers.toUtf8Bytes(message));

      const txr = aad
        ? await (instance as any).emitEncryptedECDHWithAad(callerPkHex, data)
        : await instance.emitEncryptedECDH(callerPkHex, data);
      const receipt = await txr.wait();

      console.log("Encrypted event emitted in tx:", receipt?.hash);
      console.log("Caller Curve25519 public key (hex):", callerPkHex);
      // ⚠️ DEMO ONLY – DO NOT log or print secrets in production systems.
      console.warn("⚠️  DEMO ONLY: Do NOT log secret keys in production!");
      console.log("Caller Curve25519 SECRET key (hex):", ethers.hexlify(callerSecret));
      if (aad) {
        console.log("AAD used: abi.encodePacked(msg.sender)");
        console.warn("Note: AAD binds to msg.sender (and is emitted as the first event arg). Use that value off-chain for decryption.");
      }
      return;
    }

    /* ---------------------------------------------------------------
     * LISTEN
     * ------------------------------------------------------------- */
    if (action === "listen") {
      if (mode === "key") {
        if (!key) throw new Error("--key is required in key mode for listen");
        const instance = await ethers.getContractAt("EncryptedEvents", contract as string);
        // Only indexed param is sender; undefined = any sender
        const filter = instance.filters.Encrypted(undefined);
        const aead = new AEAD(ethers.getBytes(key));

        console.log("🔊  Listening for Encrypted events …  (Ctrl‑C to quit)");
        if (aad) {
          console.warn("AAD binding uses abi.encodePacked(msg.sender). Use the 'sender' arg from the event to form AAD.");
        }

        instance.on(filter, async (ev: any) => {
          try {
            const sender: string = ev.args[0] as string;
            const nonce: string = ev.args[1] as string;
            const ciphertext: string = ev.args[2] as string;

            const aadBytes = aad ? Uint8Array.from(ethers.getBytes(sender)) : new Uint8Array();

            const plaintext = aead.decrypt(
              ethers.getBytes(nonce).slice(0, NonceSize),
              ethers.getBytes(ciphertext),
              aadBytes
            );
            console.log("🟢  Decrypted:", new TextDecoder().decode(plaintext));
          } catch (e) {
            console.error("⚠️  Failed to decrypt event:", e);
          }
        });

        process.on("SIGINT", () => {
          try { instance.removeAllListeners(); } catch {}
          process.exit(0);
        });
        await new Promise<void>(() => { /* forever */ });
        return;
      }

      // LISTEN ECDH
      if (!secret) throw new Error("--secret is required in ecdh mode for listen");
      const instance = await ethers.getContractAt("EncryptedEventsECDH", contract as string);
      const filter = instance.filters.Encrypted(undefined);

      const contractPkHex: string = await instance.contractPublicKey();
      const keyBytes = mraeDeoxysii.deriveSymmetricKey(
        ethers.getBytes(contractPkHex),
        ethers.getBytes(secret)
      );
      const aead = new AEAD(keyBytes);

      console.log("🔊  Listening (ECDH) for Encrypted events …  (Ctrl‑C to quit)");
      if (aad) {
        console.warn("AAD binding uses abi.encodePacked(msg.sender). Use the 'sender' arg from the event to form AAD.");
      }

      instance.on(filter, async (ev: any) => {
        try {
          const sender: string = ev.args[0] as string;
          const nonce: string = ev.args[1] as string;
          const ciphertext: string = ev.args[2] as string;

          const aadBytes = aad ? Uint8Array.from(ethers.getBytes(sender)) : new Uint8Array();

          const plaintext = aead.decrypt(
            ethers.getBytes(nonce).slice(0, NonceSize),
            ethers.getBytes(ciphertext),
            aadBytes
          );
          console.log("🟢  Decrypted (ECDH):", new TextDecoder().decode(plaintext));
        } catch (e) {
          console.error("⚠️  Failed to decrypt event:", e);
        }
      });

      process.on("SIGINT", () => {
        try { instance.removeAllListeners(); } catch {}
        process.exit(0);
      });
      await new Promise<void>(() => { /* forever */ });
      return;
    }

    /* ---------------------------------------------------------------
     * DECRYPT (past tx by hash)
     * ------------------------------------------------------------- */
    if (!tx) throw new Error("--tx is required for decrypt");
    const receipt = await ethers.provider.getTransactionReceipt(tx);
    if (!receipt) throw new Error("Transaction not found or not mined");

    // Minimal interface for parsing the Encrypted event
    const iface = new ethers.Interface([
      "event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext)"
    ]);

    const target = typeof contract === "string" && contract ? (contract as string).toLowerCase() : undefined;

    let parsed: any | undefined;
    for (const l of receipt.logs) {
      try {
        if (target && (l.address ?? "").toLowerCase() !== target) continue;
        const p = iface.parseLog(l);
        if (p && p.name === "Encrypted") { parsed = p; break; }
      } catch { /* ignore non-matching logs */ }
    }
    if (!parsed) {
      if (target) throw new Error("Encrypted event not found for the provided contract in this transaction");
      throw new Error("Encrypted event not found in tx logs");
    }

    const sender: string = parsed.args[0];
    const nonce: string = parsed.args[1];
    const ciphertext: string = parsed.args[2];

    if (mode === "key") {
      if (!key) throw new Error("--key is required in key mode for decrypt");
      const aead = new AEAD(ethers.getBytes(key));
      const aadBytes = aad ? Uint8Array.from(ethers.getBytes(sender)) : new Uint8Array();
      const plaintext = aead.decrypt(
        ethers.getBytes(nonce).slice(0, NonceSize),
        ethers.getBytes(ciphertext),
        aadBytes
      );
      console.log("Decrypted message:", new TextDecoder().decode(plaintext));
      return;
    }

    // ecdh mode
    if (!secret) throw new Error("--secret is required in ecdh mode for decrypt");
    const ecdh = await ethers.getContractAt("EncryptedEventsECDH", contract as string);
    const contractPkHex: string = await ecdh.contractPublicKey();
    const keyBytes = mraeDeoxysii.deriveSymmetricKey(
      ethers.getBytes(contractPkHex),
      ethers.getBytes(secret)
    );
    const aead = new AEAD(keyBytes);
    const aadBytes = aad ? Uint8Array.from(ethers.getBytes(sender)) : new Uint8Array();
    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      aadBytes
    );
    console.log("Decrypted message (ECDH):", new TextDecoder().decode(plaintext));
  });