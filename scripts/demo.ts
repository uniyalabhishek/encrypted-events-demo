import hre from "hardhat";
import { randomBytes } from "crypto";
import { AEAD, KeySize, NonceSize } from "@oasisprotocol/deoxysii";

/**
 * Minimal end-to-end demo:
 * 1. Deploy EncryptedEvents.sol
 * 2. Emit an encrypted event
 * 3. Fetch the log and decrypt it off-chain
 */
async function main() {
  const { ethers } = hre;

  /* ------------------------------------------------------------------
   * 1  Deploy contract
   * ------------------------------------------------------------------ */
  const Contract = await ethers.getContractFactory("EncryptedEvents");
  const contract = await Contract.deploy();

  // ethers v6: wait for the deployment tx to be mined
  await contract.waitForDeployment();
  console.log("Contract deployed at", contract.target);

  /* ------------------------------------------------------------------
   * 2  Prepare key & plaintext, then emit the event
   * ------------------------------------------------------------------ */
  const keyBytes = randomBytes(KeySize);                 // → Buffer(32)  (Buffer ⊂ Uint8Array)
  const keyHex   = ethers.hexlify(keyBytes);             // → bytes32 for the call
  const plaintext = "Hello Sapphire 👋";

  const tx = await contract.emitEncrypted(keyHex as `0x${string}`, plaintext);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Transaction was not mined");
  }

  /* ------------------------------------------------------------------
   * 3  Decode the log and decrypt it
   * ------------------------------------------------------------------ */
  const parsed = receipt.logs
    .map((l) => contract.interface.parseLog(l))
    .find((l) => l && l.name === "Encrypted");

  if (!parsed) {
    throw new Error("Encrypted event not found");
  }

  // Encrypted(bytes32 nonce, bytes ciphertext) → args[0], args[1]
  const nonce: string = parsed.args[0] as string;
  const ciphertext: string = parsed.args[1] as string;

  const aead  = new AEAD(keyBytes);
  const plain = aead.decrypt(
    ethers.getBytes(nonce).slice(0, NonceSize),
    ethers.getBytes(ciphertext),
    new Uint8Array()                                  // no associated data
  );

  console.log("Decrypted:", new TextDecoder().decode(plain));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
