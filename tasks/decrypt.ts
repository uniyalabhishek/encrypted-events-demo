import { task } from "hardhat/config";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";

task("decrypt", "Decrypts the Encrypted event in a transaction")
  .addParam("tx", "Transaction hash containing the Encrypted event")
  .addParam("key", "Hex-encoded 32-byte symmetric key")
  .addFlag("aad", "Use tx.from as associated data (must match contract's encodePacked(msg.sender))")
  .setAction(async ({ tx, key, aad }, hre) => {
    const { ethers } = hre;

    const receipt = await ethers.provider.getTransactionReceipt(tx);
    if (!receipt) throw new Error("Transaction not found or not mined");

    // Reuse the contract interface for log decoding
    const iface = (await ethers.getContractFactory("EncryptedEvents")).interface;
    let parsed: any | undefined;
    for (const l of receipt.logs) {
      try {
        const p = iface.parseLog(l);
        if (p && p.name === "Encrypted") { parsed = p; break; }
      } catch {}
    }
    if (!parsed) throw new Error("Encrypted event not found");

    const nonce: string = parsed.args[0];
    const ciphertext: string = parsed.args[1];

    let aadBytes = new Uint8Array();
    if (aad) {
      console.warn("AAD mode expects abi.encodePacked(msg.sender). This matches tx.from only for direct EOA→contract calls.");
      console.warn("If a relayer/forwarder/another contract called the emitter, msg.sender ≠ tx.from and decryption will fail.");
      console.warn("Consider context-bound AAD (e.g., abi.encodePacked(block.chainid, address(this))) or emitting an explicit sender address and including it in AAD.");
      const txMeta = await ethers.provider.getTransaction(tx);
      if (!txMeta || !txMeta.from) throw new Error("Missing tx.from for AAD");
      aadBytes = Uint8Array.from(ethers.getBytes(txMeta.from)); // 20 bytes to match abi.encodePacked(address)
    }

    const aead = new AEAD(ethers.getBytes(key));
    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      aadBytes
    );

    console.log("Decrypted message:", new TextDecoder().decode(plaintext));
});
