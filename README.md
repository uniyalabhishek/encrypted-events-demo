# Encrypted Events Demo (Oasis Sapphire)

Minimal, production‑ready patterns for emitting **confidential** events on Sapphire and decrypting them off‑chain.

* **Event:** `event Encrypted(bytes32 indexed nonce, bytes ciphertext);`
* **AEAD:** Deoxys‑II (`NonceSize = 15`); we store a 32‑byte nonce on‑chain and use only the first 15 bytes for decryption.
* **Two flows**

  * **A — Key in tx (default):** pass a 32‑byte symmetric key in an **encrypted** tx.
  * **B — On‑chain ECDH:** derive the symmetric key via X25519 between caller and contract.

> ⚠️ **Testnet is not production.** Confidentiality is **not guaranteed** on Testnet.

## Requirements

* Node 18+
* Docker (for Localnet)
* Git

## 1) Start Sapphire Localnet

```bash
docker run -it -p8544:8544 -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-localnet
# On Apple Silicon, add: --platform linux/amd64  (if the image lacks arm64)
```

## 2) Clone & Install

```bash
git clone https://github.com/oasisprotocol/encrypted-events-demo.git
cd encrypted-events-demo
npm install
cp .env.example .env   # paste a 0x‑prefixed private key (Localnet or your own)
```

## 3) Flow A — Key in the (encrypted) tx

> ⚠️ **Only on Sapphire.** Passing a raw key in calldata is safe **only** on Sapphire networks because the Sapphire wrappers **encrypt tx/calls**. Do **not** use this pattern on non‑Sapphire chains.

The Sapphire Hardhat plugin encrypts calldata on Sapphire networks, so passing a raw key is safe there.

```bash
# Deploy
npx hardhat deploy --network sapphire_localnet
# copy printed address to $ADDR  (this is the CONTRACT address, not a tx hash)

# Emit (prints the symmetric key). Add --aad to bind to msg.sender.
# Tip: provide --key to reuse the same key across emit & listen.
npx hardhat emit --network sapphire_localnet --contract $ADDR --message "secret 🚀" [--key <HEX32>] [--aad]

# Decrypt a past tx by hash (add --aad if you used it when emitting)
npx hardhat decrypt --network sapphire_localnet --tx <TX_HASH> --key <PRINTED_OR_PROVIDED_KEY> [--aad]

# Live listen & decrypt (stays open until Ctrl‑C; add --aad if you used it)
npx hardhat listen --network sapphire_localnet --contract $ADDR --key <PRINTED_OR_PROVIDED_KEY> [--aad]
```

### Quickest test (two terminals)

**Terminal A – listener**

```bash
export KEY=0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
npx hardhat listen --network sapphire_localnet --contract $ADDR --key $KEY
```

**Terminal B – emitter**

```bash
npx hardhat emit --network sapphire_localnet --contract $ADDR --message "secret 🚀" --key $KEY
```

**Expected:** Terminal A prints `🟢  Decrypted: secret 🚀`.

> Tip: `--key` must be the 32‑byte hex key you pass to `emit`, **not** the tx hash that `emit` prints.

## 4) Flow B — On‑chain ECDH (X25519)

```bash
# Deploy (prints the contract's Curve25519 public key)
npx hardhat deploy-ecdh --network sapphire_localnet
# copy printed address to $ADDR

# Emit (generates an ephemeral caller keypair; DEMO prints the SECRET). Add --aad to bind to msg.sender.
# Tip: provide --secret to reuse the same caller secret across emit & listen.
npx hardhat emit-ecdh --network sapphire_localnet --contract $ADDR --message "secret 🚀" [--secret <HEX32>] [--aad]

# Live listen & decrypt using the provided/printed caller SECRET (add --aad if you used it)
npx hardhat listen-ecdh --network sapphire_localnet --contract $ADDR --secret <HEX32> [--aad]
```

> **IMPORTANT (ECDH):** Sapphire derives the AEAD key from the X25519 shared secret using **HMAC‑SHA512/256** with label
> `"MRAE_Box_Deoxys-II-256-128"`. Your off‑chain code must do the same before calling `new AEAD(key)`. Example:
>
> ```ts
> import { x25519 } from '@noble/curves/ed25519';
> import { hmac } from '@noble/hashes/hmac';
> import { sha512_256 } from '@noble/hashes/sha2';
>
> const shared = x25519.scalarMult(callerSecret, contractPublic);
> const key    = hmac(sha512_256, new TextEncoder().encode('MRAE_Box_Deoxys-II-256-128'), shared);
> const aead   = new AEAD(key);
> ```


## 5) One‑shot E2E Script

```bash
npx hardhat run scripts/demo.ts --network sapphire_localnet
```

## 6) Tests

Run against Localnet (the tests skip on non‑Sapphire networks):

```bash
npm test
# or: npx hardhat test --network sapphire_localnet
```

## 7) Testnet / Mainnet

```bash
# Put your prod/test key in .env
npx hardhat deploy --network sapphire_testnet
npx hardhat deploy-ecdh --network sapphire_testnet
# Use the same emit / listen / decrypt tasks as above (swap network)
```

## Notes & Tips

* **Indexed nonce:** `bytes32 indexed nonce` enables fast topic filters (you can filter by a specific nonce; listeners use `filters.Encrypted(undefined)` to match all).
* **AAD (recommended):** Bind ciphertexts to `msg.sender` by passing AAD (`abi.encodePacked(address)` on‑chain; use `tx.from` off‑chain).
* **AAD caveat (relayers/forwarders):** `msg.sender == tx.from` only for direct EOA calls. With relayers/forwarders, they differ and decryption fails. Alternatives:
  * **Context‑bound AAD (relayer‑friendly):** `abi.encodePacked(block.chainid, address(this))` (replicate packed bytes off‑chain).
  * **Expose sender publicly:** include an `address sender` in the event and in AAD.
* **Never reuse `(key, nonce)`** and **don’t log secrets** (keys or Curve25519 secret keys) in production.
* **Encryption call:** `Sapphire.encrypt(key, nonce, bytes(message), aad)`.
* **Listeners stay open**: both `listen` and `listen-ecdh` run until you press **Ctrl‑C**.
* **Use the printed symmetric key**: `--key` expects the 32-byte key value shown by `emit`, **not** the tx hash.
* **Common gotcha**: `--contract` expects a **contract address** (0x…), not a transaction hash.

## **License:** Apache-2.0
