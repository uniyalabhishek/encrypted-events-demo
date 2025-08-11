import { task } from "hardhat/config";
import { x25519 } from "@noble/curves/ed25519";

task("emit-ecdh", "Calls emitEncryptedECDH using a fresh caller Curve25519 keypair")
  .addParam("contract", "Address of the deployed EncryptedEventsECDH contract")
  .addOptionalParam("message", "Plaintext to encrypt", "Hello Sapphire 👋")
  .addOptionalParam("secret", "Hex-encoded 32-byte caller secret key")
  .addFlag("aad", "Include associated data (msg.sender) for authenticity")
  .setAction(async ({ contract, message, aad, secret }, hre) => {
    const { ethers } = hre;

    const instance = await ethers.getContractAt("EncryptedEventsECDH", contract);

    // Fetch contract's Curve25519 public key (32 bytes as 0x-hex)
    const contractPkHex: string = await instance.contractPublicKey();

    // Caller Curve25519 keypair (use provided secret if given; otherwise generate ephemeral)
    const callerSecret = secret ? ethers.getBytes(secret) : ethers.randomBytes(32);
    if (callerSecret.length !== 32) {
      throw new Error("Caller secret must be 32 bytes");
    }
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
      console.warn("Note: AAD binds to msg.sender. This matches tx.from only for direct EOA→contract calls.");
      console.warn("If a relayer/forwarder/another contract calls this, msg.sender ≠ tx.from and off-chain decryption will fail.");
      console.warn("Consider context-bound AAD instead (e.g., abi.encodePacked(block.chainid, address(this))) or emit an explicit sender address and include it in AAD.");
    }
  });
