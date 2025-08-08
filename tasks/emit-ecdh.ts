import { task } from "hardhat/config";
import { x25519 } from "@noble/curves/ed25519";

task("emit-ecdh", "Calls emitEncryptedECDH using a fresh caller Curve25519 keypair")
  .addParam("contract", "Address of the deployed EncryptedEventsECDH contract")
  .addOptionalParam("message", "Plaintext to encrypt", "Hello Sapphire 👋")
  .addFlag("aad", "Include associated data (msg.sender) for authenticity")
  .setAction(async ({ contract, message, aad }, hre) => {
    const { ethers } = hre;

    const instance = await ethers.getContractAt("EncryptedEventsECDH", contract);

    // Fetch contract's Curve25519 public key (32 bytes as 0x-hex)
    const contractPkHex: string = await instance.contractPublicKey();

    // Generate caller Curve25519 keypair using noble x25519
    const callerSecret = ethers.randomBytes(32);
    const callerPublic = x25519.getPublicKey(callerSecret);
    const callerPkHex = ethers.hexlify(callerPublic) as `0x${string}`;
    const callerSkHex = ethers.hexlify(callerSecret) as `0x${string}`;

    // Send caller public key to the contract; encryption is handled by the Sapphire plugin.
    const tx = aad
      ? await (instance as any).emitEncryptedECDHWithAad(callerPkHex, message)
      : await instance.emitEncryptedECDH(callerPkHex, message);
    const receipt = await tx.wait();

    console.log("Encrypted event emitted in tx:", receipt?.hash);
    console.log("Caller Curve25519 public key (hex):", callerPkHex);
    // ⚠️ DEMO ONLY – DO NOT log or print secrets in production systems.
    console.warn("⚠️  DEMO ONLY: Do NOT log secret keys in production!");
    console.log("Caller Curve25519 SECRET key (hex):", callerSkHex);
    console.log("➡️  Keep the SECRET key. Use it with `listen-ecdh` to decrypt events.");
    console.log("Contract Curve25519 public key (hex):", contractPkHex);
    if (aad) {
      console.log("AAD used: abi.encodePacked(msg.sender)");
    }
  });