import { task } from "hardhat/config";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";
import { x25519 } from "@noble/curves/ed25519";
import { mraeDeoxysii } from "@oasisprotocol/client-rt";

/**
 * Unified command:
 *   EMIT (key):  npx hardhat enc --network <net> --action emit --mode key  --contract <ADDR> [--message "..."] [--key <HEX32>] [--aad]
 *   EMIT (ecdh):  npx hardhat enc --network <net> --action emit --mode ecdh --contract <ADDR> [--message "..."] [--secret <HEX32>] [--aad]
 *   LISTEN (key): npx hardhat enc --network <net> --action listen --mode key  --contract <ADDR> --key <HEX32> [--aad]
 *   LISTEN (ecdh):npx hardhat enc --network <net> --action listen --mode ecdh --contract <ADDR> --secret <HEX32> [--aad]
 */
task("enc", "Unified emit/listen for encrypted events (key|ecdh)")
  .addParam("action", "emit | listen")
  .addParam("mode", "key | ecdh")
  .addParam("contract", "Contract address")
  .addOptionalParam("message", "Plaintext to encrypt (emit)", "Hello Sapphire 👋")
  .addOptionalParam("key", "Hex-encoded 32-byte symmetric key (key mode)")
  .addOptionalParam("secret", "Hex-encoded 32-byte caller Curve25519 secret (ecdh mode)")
  .addFlag("aad", "Bind/decode with abi.encodePacked(msg.sender)")
  .setAction(async ({ action, mode, contract, message, key, secret, aad }, hre) => {
    const { ethers } = hre;
    if (!["emit", "listen"].includes(action)) throw new Error("action must be 'emit' or 'listen'");
    if (!["key", "ecdh"].includes(mode)) throw new Error("mode must be 'key' or 'ecdh'");

    if (action === "emit") {
      if (mode === "key") {
        const instance = await ethers.getContractAt("EncryptedEvents", contract);
        const keyHex = (key as `0x${string}`) ?? (ethers.hexlify(ethers.randomBytes(32)) as `0x${string}`);
        const tx = aad
          ? await (instance as any).emitEncryptedWithAad(keyHex, message)
          : await instance.emitEncrypted(keyHex, message);
        const receipt = await tx.wait();
        console.log("Encrypted event emitted in tx:", receipt?.hash);
        console.log("Symmetric key (hex):", keyHex);
        if (aad) {
          console.log("AAD used: abi.encodePacked(msg.sender)");
          console.warn("Note: AAD matches tx.from only for direct EOA→contract calls.");
          console.warn("With relayers/forwarders, msg.sender ≠ tx.from; consider context-bound AAD like abi.encodePacked(block.chainid, address(this)) or emit an explicit sender and include it in AAD.");
        }
        return;
      }

      // ECDH emit
      const instance = await ethers.getContractAt("EncryptedEventsECDH", contract);
      const callerSecret = secret ? ethers.getBytes(secret) : ethers.randomBytes(32);
      if (callerSecret.length !== 32) throw new Error("Caller secret must be 32 bytes");
      const callerPublic = x25519.getPublicKey(callerSecret);
      const callerPkHex = ethers.hexlify(callerPublic) as `0x${string}`;

      const tx = aad
        ? await (instance as any).emitEncryptedECDHWithAad(callerPkHex, message)
        : await instance.emitEncryptedECDH(callerPkHex, message);
      const receipt = await tx.wait();

      console.log("Encrypted event emitted in tx:", receipt?.hash);
      console.log("Caller Curve25519 public key (hex):", callerPkHex);
      // ⚠️ DEMO ONLY – DO NOT log or print secrets in production systems.
      console.warn("⚠️  DEMO ONLY: Do NOT log secret keys in production!");
      console.log("Caller Curve25519 SECRET key (hex):", ethers.hexlify(callerSecret));
      if (aad) {
        console.log("AAD used: abi.encodePacked(msg.sender)");
        console.warn("Note: AAD matches tx.from only for direct EOA→contract calls.");
        console.warn("With relayers/forwarders, msg.sender ≠ tx.from; consider context-bound AAD like abi.encodePacked(block.chainid, address(this)) or emit an explicit sender and include it in AAD.");
      }
      return;
    }

    // LISTEN actions
    if (mode === "key") {
      if (!key) throw new Error("--key is required in key mode for listen");
      const instance = await ethers.getContractAt("EncryptedEvents", contract);
      const filter   = instance.filters.Encrypted(undefined);
      const aead = new AEAD(ethers.getBytes(key));

      console.log("🔊  Listening for Encrypted events …  (Ctrl‑C to quit)");
      if (aad) {
        console.warn("AAD binding uses abi.encodePacked(msg.sender). This assumes direct EOA→contract call.");
        console.warn("With relayers/forwarders, msg.sender ≠ tx.from and decryption will fail. Consider context-bound AAD instead.");
      }

      instance.on(filter, async (ev: any) => {
        try {
          const nonce: string = ev.args[0] as string;
          const ciphertext: string = ev.args[1] as string;

          let aadBytes = new Uint8Array();
          if (aad) {
            const txHash: string | undefined =
              ev?.log?.transactionHash ?? ev?.transactionHash ?? undefined;
            if (!txHash) throw new Error("Missing transactionHash for AAD");
            const txMeta = await ethers.provider.getTransaction(txHash);
            if (!txMeta || !txMeta.from) throw new Error("Missing tx.from for AAD");
            aadBytes = Uint8Array.from(ethers.getBytes(txMeta.from)); // 20 bytes
          }

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
    const instance = await ethers.getContractAt("EncryptedEventsECDH", contract);
    const filter   = instance.filters.Encrypted(undefined);

    const contractPkHex: string = await instance.contractPublicKey();
    const keyBytes = mraeDeoxysii.deriveSymmetricKey(
      ethers.getBytes(contractPkHex),
      ethers.getBytes(secret)
    );
    const aead = new AEAD(keyBytes);

    console.log("🔊  Listening (ECDH) for Encrypted events …  (Ctrl‑C to quit)");
    if (aad) {
      console.warn("AAD binding uses abi.encodePacked(msg.sender). This assumes a direct EOA→contract call.");
      console.warn("With relayers/forwarders, msg.sender ≠ tx.from; consider context-bound AAD (e.g., abi.encodePacked(block.chainid, address(this))) or emit the sender address and include it in AAD.");
    }

    instance.on(filter, async (ev: any) => {
      try {
        const nonce: string = ev.args[0] as string;
        const ciphertext: string = ev.args[1] as string;

        let aadBytes = new Uint8Array();
        if (aad) {
          const txHash: string | undefined =
            ev?.log?.transactionHash ?? ev?.transactionHash ?? undefined;
          if (!txHash) throw new Error("Missing transactionHash for AAD");
          const txMeta = await ethers.provider.getTransaction(txHash);
          if (!txMeta || !txMeta.from) throw new Error("Missing tx.from for AAD");
          aadBytes = Uint8Array.from(ethers.getBytes(txMeta.from)); // 20 bytes
        }

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
  });