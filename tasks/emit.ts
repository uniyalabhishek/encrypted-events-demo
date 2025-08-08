import { task } from "hardhat/config";
import { randomBytes } from "crypto";

task("emit", "Calls emitEncrypted on a deployed contract")
  .addParam("contract", "Address of the deployed EncryptedEvents contract")
  .addOptionalParam("message", "Plaintext to encrypt", "Hello Sapphire 👋")
  .addFlag("aad", "Include associated data (msg.sender) for authenticity")
  .setAction(async ({ contract, message, aad }, hre) => {
    const { ethers } = hre;
    const keyBytes = randomBytes(32);
    const keyHex = ethers.hexlify(keyBytes) as `0x${string}`;

    const instance = await ethers.getContractAt("EncryptedEvents", contract);

    // If TypeChain artifacts are stale, the WithAad overload might not be present in typings.
    const tx = aad
      ? await (instance as any).emitEncryptedWithAad(keyHex, message)
      : await instance.emitEncrypted(keyHex, message);

    const receipt = await tx.wait();

    console.log("Encrypted event emitted in tx:", receipt?.hash);
    console.log("Symmetric key (hex):", keyHex);
    if (aad) {
      console.log("AAD used: abi.encodePacked(msg.sender)");
    }
});
