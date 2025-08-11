import { task } from "hardhat/config";
import { randomBytes } from "crypto";

task("emit", "Calls emitEncrypted on a deployed contract")
  .addParam("contract", "Address of the deployed EncryptedEvents contract")
  .addOptionalParam("message", "Plaintext to encrypt", "Hello Sapphire 👋")
  .addOptionalParam("key", "Hex-encoded 32-byte symmetric key")
  .addFlag("aad", "Include associated data (msg.sender) for authenticity")
  .setAction(async ({ contract, message, key, aad }, hre) => {
    const { ethers } = hre;
    const keyHex =
      (key as `0x${string}`) ??
      (ethers.hexlify(randomBytes(32)) as `0x${string}`);

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
      console.warn("Note: AAD binds to msg.sender. This matches tx.from only for direct EOA→contract calls.");
      console.warn("If a relayer/forwarder/another contract calls this, msg.sender ≠ tx.from and off-chain decryption will fail.");
      console.warn("Consider context-bound AAD instead (e.g., abi.encodePacked(block.chainid, address(this))) or emit an explicit sender address and include it in AAD.");
    }
  });
