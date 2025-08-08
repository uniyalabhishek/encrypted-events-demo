# Encrypted Events Demo (Oasis Sapphire)

Minimal, production‑ready patterns for emitting **confidential** events on Sapphire and decrypting them off‑chain.

* **Event:** `event Encrypted(bytes32 indexed nonce, bytes ciphertext);`
* **AEAD:** Deoxys‑II (`NonceSize = 15`); we store a 32‑byte nonce on‑chain and use only the first 15 bytes for decryption.
* **Two flows**

  * **A — Key in tx (default):** pass a 32‑byte symmetric key in an **encrypted** tx.
  * **B — On‑chain ECDH:** derive the symmetric key via X25519 between caller and contract.

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

The Sapphire Hardhat plugin encrypts calldata on Sapphire networks, so passing a raw key is safe there.

```bash
# Deploy
npx hardhat deploy --network sapphire_localnet
# copy printed address to $ADDR

# Emit (prints the symmetric key). Add --aad to bind to msg.sender.
npx hardhat emit --network sapphire_localnet --contract $ADDR --message "secret 🚀" [--aad]

# Decrypt a past tx by hash (add --aad if you used it when emitting)
npx hardhat decrypt --network sapphire_localnet --tx <TX_HASH> --key <PRINTED_KEY> [--aad]

# Live listen & decrypt (add --aad if you used it)
npx hardhat listen --network sapphire_localnet --contract $ADDR --key <PRINTED_KEY> [--aad]
```

## 4) Flow B — On‑chain ECDH (X25519)

```bash
# Deploy (prints the contract's Curve25519 public key)
npx hardhat deploy-ecdh --network sapphire_localnet
# copy printed address to $ADDR

# Emit (generates an ephemeral caller keypair; DEMO prints the SECRET). Add --aad to bind to msg.sender.
npx hardhat emit-ecdh --network sapphire_localnet --contract $ADDR --message "secret 🚀" [--aad]

# Live listen & decrypt using the printed caller SECRET (add --aad if you used it)
npx hardhat listen-ecdh --network sapphire_localnet --contract $ADDR --secret <CALLER_SECRET_HEX> [--aad]
```

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

* **Indexed nonce:** `bytes32 indexed nonce` enables fast topic filters (you can filter by a specific nonce; listeners use `filters.Encrypted(null)` to match all).
* **AAD (recommended):** Bind ciphertexts to `msg.sender` by passing AAD (`abi.encodePacked(address)` on-chain; use `tx.from` off-chain).
* **Never reuse `(key, nonce)`** and **don’t log secrets** (keys or Curve25519 secret keys) in production.
* **Encryption call:** `Sapphire.encrypt(key, nonce, bytes(message), aad)`.

## **License:** Apache-2.0
