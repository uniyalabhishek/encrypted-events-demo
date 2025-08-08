import { task } from "hardhat/config";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";
import { x25519 } from "@noble/curves/ed25519";

/**
 * `npx hardhat listen-ecdh --network <net> --contract <ADDR> --secret <HEX32>`
 *
 * Derives a symmetric key via X25519 using the caller's secret key (provided here)
 * and the contract's public key (fetched from chain), then listens to the
 * `Encrypted(bytes32,bytes)` events and decrypts them live.
 */
task("listen-ecdh", "Subscribes to Encrypted events (ECDH variant) and decrypts logs live")
  .addParam("contract", "Address of the EncryptedEventsECDH contract")
  .addParam("secret", "Hex-encoded 32-byte caller Curve25519 secret key")
  .addFlag("aad", "Expect associated data bound to msg.sender")
  .setAction(async ({ contract, secret, aad }, hre) => {
    const { ethers } = hre;

    const instance = await ethers.getContractAt("EncryptedEventsECDH", contract);
    const filter   = instance.filters.Encrypted(undefined); // nonce is indexed; undefined = any

    // Derive the shared symmetric key: scalarMult(callerSecret, contractPublic)
    const contractPkHex: string = await instance.contractPublicKey();
    const contractPk = ethers.getBytes(contractPkHex);
    const callerSk   = ethers.getBytes(secret);

    if (callerSk.length !== 32 || contractPk.length !== 32) {
      throw new Error("Invalid key lengths: both caller secret and contract public must be 32 bytes");
    }

    const shared = x25519.scalarMult(callerSk, contractPk); // Uint8Array(32)
    const aead   = new AEAD(shared);

    console.log("🔊  Listening (ECDH) for Encrypted events …  (Ctrl‑C to quit)");

    instance.on(filter, async (...args: any[]) => {
      try {
        const ev = args[args.length - 1];
        const nonce      = args[0] as string;
        const ciphertext = args[1] as string;

        let aadBytes = new Uint8Array();
        if (aad) {
          const txHash: string | undefined =
            ev?.log?.transactionHash ?? ev?.transactionHash ?? undefined;
          if (!txHash) {
            throw new Error("Missing transactionHash for AAD");
          }
          const txMeta = await ethers.provider.getTransaction(txHash);
          if (!txMeta || !txMeta.from) throw new Error("Missing tx.from for AAD");
          aadBytes = Uint8Array.from(ethers.getBytes(txMeta.from)); // 20 bytes
        }

        const plaintext = aead.decrypt(
          ethers.getBytes(nonce).slice(0, NonceSize), // Deoxys‑II uses first 15 bytes
          ethers.getBytes(ciphertext),
          aadBytes
        );

        console.log("🟢  Decrypted (ECDH):", new TextDecoder().decode(plaintext));
      } catch (e) {
        console.error("⚠️  Failed to decrypt event:", e);
      }
    });
  });