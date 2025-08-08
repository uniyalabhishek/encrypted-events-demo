# Encrypted Events Demo for Oasis Sapphire

This repo shows the **smallest possible** way to emit *confidential* events on the Oasis Sapphire confidential EVM and to decrypt them off-chain.

**Contract:** `contracts/EncryptedEvents.sol`  
**Stack:** TypeScript · Hardhat · Ethers v6 · Deoxys-II

---

## 1. Quick Start (⚡ Localnet in 2 mins)

```bash
# ➊ Spin up Sapphire Localnet
docker run -it -p8544:8544 -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-localnet

# ➋ Clone & install
git clone https://github.com/oasisprotocol/encrypted-events-demo.git
cd encrypted-events-demo
npm install
npm run typechain      # optional, generates typings

# Copy .env.example → .env and paste a private key from the locally running localnet

# ➌ Run the happy path
npx hardhat deploy --network sapphire_localnet
npx hardhat emit   --network sapphire_localnet --contract <ADDR> --message "Hello Sapphire 👋"
npx hardhat decrypt --network sapphire_localnet --tx <TX_HASH> --key <PRINTED_KEY>
```

---

## 2. How it Works

| Step | On-chain / Off-chain | What happens                               |
| ---- | -------------------- | ------------------------------------------ |
| 1    | Off-chain            | Script generates a 32-byte symmetric key   |
| 2    | On-chain             | `Sapphire.randomBytes` → unique `nonce`    |
| 3    | On-chain             | `Sapphire.encrypt(key, nonce, message)`    |
| 4    | On-chain             | `emit Encrypted(nonce, ciphertext)`        |
| 5    | Off-chain            | Decrypt with Deoxys-II using `(key,nonce)` |

---

## 3. Security Notes & Gas Cost

* **Events are public.** Anyone sees the ciphertext & nonce. *Never* emit plaintext you expect to keep private.
* **Key handling.** The demo passes the key as calldata, which is fine only when the transaction itself is encrypted. In production consider:

  * Deriving the key on-chain (`Sapphire.deriveSymmetricKey`), or
  * Encrypting the transaction with the Sapphire plugin/wrappers
* **Do not log secrets** (symmetric keys or Curve25519 secrets) in production.
* **Testnet is not production**; confidentiality is not guaranteed there.

---

## 4. Project Scripts

| Command                                                       | Purpose                           |
| ------------------------------------------------------------- | --------------------------------- |
| `npm test`                                                    | Unit test decrypts emitted event  |
| `npx hardhat deploy`                                          | Deploy contract (task)            |
| `npx hardhat emit`                                            | Send encrypted event (task)       |
| `npx hardhat decrypt`                                         | Decode & decrypt a past tx (task) |
| `npx hardhat run scripts/demo.ts --network sapphire_localnet` | One-shot E2E demo                 |

---

## 5. FAQ

### Does Sapphire hide *all* transaction data?

State and calldata can be fully encrypted, but **logs are intentionally public** so that off-chain indexers can work. This repo demonstrates encrypting the log payload.

---

## License Apache License 2.0 — see [LICENSE](LICENSE)
