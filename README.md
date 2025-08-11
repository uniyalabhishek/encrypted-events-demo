# Encrypted Events Demo (Oasis Sapphire)

Minimal, production‑ready patterns for emitting **confidential** events on Sapphire and decrypting them off‑chain.

* **Event:** `event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);`
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
docker run -it -p8544-8548:8544-8548 ghcr.io/oasisprotocol/sapphire-localnet
# On Apple Silicon, add: --platform linux/amd64  (if the image lacks arm64)
```

## 2) Clone & Install

```bash
git clone https://github.com/oasisprotocol/encrypted-events-demo.git
cd encrypted-events-demo
npm install
cp .env.example .env   # paste a 0x‑prefixed private key (Localnet or your own)

# (Optional) Better typings for overloads:
npm run build:types    # runs hardhat compile + typechain
```

## 3) Flow A — Key in the (encrypted) tx

> ⚠️ **Only on Sapphire.** Passing a raw key in calldata is safe **only** on Sapphire networks because the Sapphire wrappers **encrypt tx/calls**. Do **not** use this pattern on non‑Sapphire chains.

```bash
# Deploy
npx hardhat deploy --network sapphire-localnet
# copy printed address to $ADDR  (this is the CONTRACT address, not a tx hash)

# Emit (prints the symmetric key). Add --aad to bind to msg.sender.
# Tip: provide --key to reuse the same key across emit & listen.
npx hardhat enc --network sapphire-localnet \
  --action emit --mode key --contract $ADDR \
  --message "secret 🚀" [--key <HEX32>] [--aad]

# Decrypt a past tx by hash (add --aad if you used it when emitting)
# (In key mode, --contract is optional; pass it to disambiguate if the tx has multiple logs.)
npx hardhat enc --network sapphire-localnet \
  --action decrypt --mode key [--contract $ADDR] \
  --tx <TX_HASH> --key <PRINTED_OR_PROVIDED_KEY> [--aad]

# Live listen & decrypt (stays open until Ctrl‑C; add --aad if you used it)
npx hardhat enc --network sapphire-localnet \
  --action listen --mode key --contract $ADDR \
  --key <PRINTED_OR_PROVIDED_KEY> [--aad]
```

### Quickest test (two terminals)

**Terminal A – listener**

```bash
export KEY=0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
npx hardhat enc --network sapphire-localnet --action listen --mode key --contract $ADDR --key $KEY
```

**Terminal B – emitter**

```bash
npx hardhat enc --network sapphire-localnet --action emit --mode key --contract $ADDR --message "secret 🚀" --key $KEY
```

**Expected:** Terminal A prints `🟢  Decrypted: secret 🚀`.

> Tip: `--key` must be the 32‑byte hex key you pass to `emit`, **not** the tx hash.

## 4) Flow B — On‑chain ECDH (X25519)

```bash
# Deploy (prints the contract's Curve25519 public key)
npx hardhat deploy-ecdh --network sapphire-localnet
# copy printed address to $ADDR

# Emit (generates an ephemeral caller keypair; DEMO prints the SECRET). Add --aad to bind to msg.sender.
# Tip: provide --secret to reuse the same caller secret across emit & listen.
npx hardhat enc --network sapphire-localnet \
  --action emit --mode ecdh --contract $ADDR \
  --message "secret 🚀" [--secret <HEX32>] [--aad]

# Live listen & decrypt using the provided/printed caller SECRET (add --aad if you used it)
npx hardhat enc --network sapphire-localnet \
  --action listen --mode ecdh --contract $ADDR \
  --secret <HEX32> [--aad]

# Decrypt a past tx (ECDH — needs the contract to fetch its public key)
npx hardhat enc --network sapphire-localnet \
  --action decrypt --mode ecdh --contract $ADDR \
  --tx <TX_HASH> --secret <HEX32> [--aad]
```

> **IMPORTANT (ECDH):** Off‑chain, derive the AEAD key from the X25519 keys using the **official SDK helper**:
>
> ```ts
> import { mraeDeoxysii } from '@oasisprotocol/client-rt';
> // contractPublic: Uint8Array(32), callerSecret: Uint8Array(32)
> const key = mraeDeoxysii.deriveSymmetricKey(contractPublic, callerSecret);
> const aead = new AEAD(key);
> ```
>
> This mirrors Sapphire’s on‑chain derivation.

## 5) One‑shot E2E Script

```bash
npx hardhat run scripts/demo.ts --network sapphire-localnet
```

## 6) Tests

Run against Localnet (the tests skip on non‑Sapphire networks):

```bash
npm test
# or: npx hardhat test --network sapphire-localnet
```

## Notes & Tips

* **Index wisely:** indexing a *random nonce* is rarely useful; indexing `sender` is generally better. Changing `bytes32 → bytes15` does **not** reduce topic cost when indexed (topics cost is flat per topic).
* **Gas footnote:** If you emit a **non‑indexed** `bytes15 nonce` instead of `bytes32`, you save \~136 gas per event (17 bytes × 8 gas/byte) in the log data. We keep `bytes32` for simplicity and future derivations.
* **AAD (recommended):** Bind ciphertexts to `msg.sender` and **emit it**. Off‑chain, use the event’s first arg (`sender`) as AAD bytes.
* **Never reuse `(key, nonce)`** and **don’t log secrets** (keys or Curve25519 secret keys) in production.
* **Plaintext length leaks size.** If sensitive, pad to fixed buckets client‑side.
* **Nonce personalization:** `Sapphire.randomBytes(32, bytes("EncryptedEvents:nonce"))`.
* **Encryption call:** `Sapphire.encrypt(key, nonce, message, aad)` where `message` is `bytes`.
* **Listeners stay open** until you press **Ctrl‑C**.
* **Common gotcha**: `--contract` expects a **contract address** (0x…) for all commands except `decrypt --mode key`, where it is optional.

## **License:** Apache-2.0
