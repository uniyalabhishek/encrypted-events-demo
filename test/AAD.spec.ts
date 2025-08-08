import { expect } from "chai";
import { ethers } from "hardhat";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";
import { randomBytes } from "crypto";
import { x25519 } from "@noble/curves/ed25519";

describe("AAD behavior", function () {
  before(async function () {
    const net = await ethers.provider.getNetwork();
    const sapphire = new Set([0x5afe, 0x5aff, 0x5afd].map(BigInt));
    if (!sapphire.has(net.chainId)) {
      // Sapphire precompiles are not available on non‑Sapphire networks.
      // eslint-disable-next-line no-restricted-syntax
      (this as any).skip?.();
    }
  });

  it("EncryptedEvents: decrypt fails without AAD and succeeds with correct AAD", async function () {
    const Contract = await ethers.getContractFactory("EncryptedEvents");
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    const keyBytes = randomBytes(32);
    const keyHex = ethers.hexlify(keyBytes) as `0x${string}`;
    const message = "AAD bound message";

    // Call AAD variant
    const tx = await (contract as any).emitEncryptedWithAad(keyHex, message);
    const receipt = await tx.wait();

    const parsed = receipt!.logs
      .map((l: any) => contract.interface.parseLog(l))
      .find((l: any) => l && l.name === "Encrypted");
    if (!parsed) throw new Error("Encrypted event not found");

    const nonce: string = parsed.args[0];
    const ciphertext: string = parsed.args[1];

    const aead = new AEAD(keyBytes);

    // Wrong/no AAD should throw
    expect(() =>
      aead.decrypt(
        ethers.getBytes(nonce).slice(0, NonceSize),
        ethers.getBytes(ciphertext),
        new Uint8Array()
      )
    ).to.throw();

    // Correct AAD (20-byte address equal to tx.from)
    const txMeta = await ethers.provider.getTransaction(tx.hash);
    if (!txMeta || !txMeta.from) throw new Error("Missing tx.from for AAD");
    const aadBytes = ethers.getBytes(txMeta.from);

    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      aadBytes
    );
    expect(new TextDecoder().decode(plaintext)).to.equal(message);
  });

  it("EncryptedEventsECDH: decrypt fails without AAD and succeeds with correct AAD", async function () {
    const Contract = await ethers.getContractFactory("EncryptedEventsECDH");
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    // Caller keypair (off-chain)
    const callerSk = ethers.randomBytes(32);
    const callerPk = x25519.getPublicKey(callerSk);
    const callerPkHex = ethers.hexlify(callerPk) as `0x${string}`;

    const message = "AAD bound ECDH message";

    // Emit using AAD variant
    const tx = await (contract as any).emitEncryptedECDHWithAad(
      callerPkHex,
      message
    );
    const receipt = await tx.wait();

    // Fetch contract's public key and derive shared key off-chain
    const contractPkHex: string = await contract.contractPublicKey();
    const shared = x25519.scalarMult(callerSk, ethers.getBytes(contractPkHex));

    // Parse log
    const parsed = receipt!.logs
      .map((l: any) => contract.interface.parseLog(l))
      .find((l: any) => l && l.name === "Encrypted");
    if (!parsed) throw new Error("Encrypted event not found");

    const nonce: string = parsed.args[0];
    const ciphertext: string = parsed.args[1];

    const aead = new AEAD(shared);

    // Wrong/no AAD should throw
    expect(() =>
      aead.decrypt(
        ethers.getBytes(nonce).slice(0, NonceSize),
        ethers.getBytes(ciphertext),
        new Uint8Array()
      )
    ).to.throw();

    // Correct AAD (tx.from)
    const txMeta = await ethers.provider.getTransaction(tx.hash);
    if (!txMeta || !txMeta.from) throw new Error("Missing tx.from for AAD");
    const aadBytes = ethers.getBytes(txMeta.from);

    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      aadBytes
    );
    expect(new TextDecoder().decode(plaintext)).to.equal(message);
  });
});
