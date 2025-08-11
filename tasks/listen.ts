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
  .addFlag("aad", "Expect associated data bound to msg.sender")
  .setAction(async ({ contract, key, aad }, hre) => {
    const { ethers } = hre;

    const instance = await ethers.getContractAt("EncryptedEvents", contract);
    const filter   = instance.filters.Encrypted(undefined); // nonce is indexed; undefined = any

    console.log("🔊  Listening for Encrypted events …  (Ctrl‑C to quit)");
    if (aad) {
      console.warn("AAD binding uses abi.encodePacked(msg.sender). This assumes a direct EOA→contract call.");
      console.warn("With relayers/forwarders, msg.sender ≠ tx.from and decryption will fail. Consider context-bound AAD (e.g., abi.encodePacked(block.chainid, address(this))) or emit the sender address and include it in AAD.");
    }

    const aead = new AEAD(ethers.getBytes(key));

    // Use contract-level event subscription to avoid ProviderEvent typing issues.
    instance.on(filter, async (ev: any) => {
      try {
        // ethers v6 passes a single event payload; read values from ev.args
        const nonce: string = ev.args[0] as string;
        const ciphertext: string = ev.args[1] as string;

        let aadBytes = new Uint8Array();
        if (aad) {
          const txHash: string | undefined =
            ev?.log?.transactionHash ?? ev?.transactionHash ?? undefined;
          if (!txHash) {
            throw new Error("Missing transactionHash for AAD");
          }
          const txMeta = await ethers.provider.getTransaction(txHash);
          if (!txMeta || !txMeta.from) throw new Error("Missing tx.from for AAD");
          // Match abi.encodePacked(msg.sender) → 20-byte address
          aadBytes = Uint8Array.from(ethers.getBytes(txMeta.from));
        }

        const plaintext = aead.decrypt(
          ethers.getBytes(nonce).slice(0, NonceSize), // Deoxys‑II uses first 15 bytes
          ethers.getBytes(ciphertext),
          aadBytes
        );

        console.log("🟢  Decrypted:", new TextDecoder().decode(plaintext));
      } catch (e) {
        console.error("⚠️  Failed to decrypt event:", e);
      }
    });

    // Keep the task alive until interrupted
    process.on("SIGINT", () => {
      try { instance.removeAllListeners(); } catch {}
      process.exit(0);
    });
    await new Promise<void>(() => { /* forever */ });
  });
