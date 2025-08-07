import { task } from "hardhat/config";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";

task("decrypt", "Decrypts the Encrypted event in a transaction")
  .addParam("tx", "Transaction hash containing the Encrypted event")
  .addParam("key", "Hex-encoded 32-byte symmetric key")
  .setAction(async ({ tx, key }, hre) => {
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

    const aead = new AEAD(ethers.getBytes(key));
    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      new Uint8Array() // no associated data
    );

    console.log("Decrypted message:", new TextDecoder().decode(plaintext));
  });