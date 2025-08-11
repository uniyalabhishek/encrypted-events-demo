import { expect } from "chai";
import { ethers } from "hardhat";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";
import { x25519 } from "@noble/curves/ed25519";
import { deriveSapphireSymmetricKeyFromShared } from "../utils/sapphire-ecdh";

describe("EncryptedEventsECDH", function () {
  it("derives a shared key (X25519) and decrypts the emitted ciphertext", async function () {
    const net = await ethers.provider.getNetwork();
    const sapphireChainIds = new Set([0x5afe, 0x5aff, 0x5afd].map(BigInt));
    if (!sapphireChainIds.has(net.chainId)) {
      // Skip on non‑Sapphire networks where precompiles are unavailable.
      // eslint-disable-next-line no-restricted-syntax
      (this as any).skip?.();
    }

    const Contract = await ethers.getContractFactory("EncryptedEventsECDH");
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    // 1) Off‑chain: caller keypair
    const callerSk = ethers.randomBytes(32);
    const callerPk = x25519.getPublicKey(callerSk);
    const callerPkHex = ethers.hexlify(callerPk) as `0x${string}`;

    // 2) On‑chain: emit encrypted
    const message = "Hello Sapphire ECDH 👋";
    const tx = await contract.emitEncryptedECDH(callerPkHex, message);
    const receipt = await tx.wait();

    // 3) Fetch contract public key and derive shared key off‑chain
    const contractPkHex: string = await contract.contractPublicKey();
    const shared = x25519.scalarMult(callerSk, ethers.getBytes(contractPkHex)); // 32 bytes
    const key = deriveSapphireSymmetricKeyFromShared(shared);

    // 4) Parse log and decrypt
    const parsed = receipt!.logs
      .map((l) => contract.interface.parseLog(l))
      .find((l) => l && l.name === "Encrypted");
    if (!parsed) throw new Error("Encrypted event not found");

    const nonce: string = parsed.args[0];
    const ciphertext: string = parsed.args[1];

    const aead = new AEAD(key);
    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      new Uint8Array() // no AAD in this test
    );

    expect(new TextDecoder().decode(plaintext)).to.equal(message);
  });
});
