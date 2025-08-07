// tasks/listen.ts
import { task } from "hardhat/config";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";

/**
 * `npx hardhat listen --network <net> --contract <ADDR> --key <HEX32>`
 *
 * Continuously listens for `Encrypted(bytes32,bytes)` events emitted by a
 * deployed `EncryptedEvents` contract and prints the decrypted plaintext.
 *
 * ▸ Suitable for ROFL containers or any backend that needs push‑style updates.
 */
task("listen", "Subscribes to Encrypted events and decrypts logs live")
  .addParam("contract", "Address of the EncryptedEvents contract")
  .addParam("key", "Hex‑encoded 32‑byte symmetric key")
  .setAction(async ({ contract, key }, hre) => {
    const { ethers } = hre;

    const instance = await ethers.getContractAt("EncryptedEvents", contract);
    const filter   = instance.filters.Encrypted();

    console.log("🔊  Listening for Encrypted events …  (Ctrl‑C to quit)");

    const aead = new AEAD(ethers.getBytes(key));

    ethers.provider.on(filter, (log) => {
      try {
        const parsed      = instance.interface.parseLog(log);
        const nonce       = parsed.args[0] as string;
        const ciphertext  = parsed.args[1] as string;

        const plaintext = aead.decrypt(
          ethers.getBytes(nonce).slice(0, NonceSize), // Deoxys‑II uses first 15 bytes
          ethers.getBytes(ciphertext),
          new Uint8Array()                             // no associated data
        );

        console.log("🟢  Decrypted:", new TextDecoder().decode(plaintext));
      } catch (e) {
        console.error("⚠️  Failed to decrypt event:", e);
      }
    });
  });