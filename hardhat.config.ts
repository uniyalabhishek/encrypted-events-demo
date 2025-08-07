// hardhat.config.ts
import "dotenv/config";
import "@oasisprotocol/sapphire-hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import { HardhatUserConfig } from "hardhat/config";

// custom tasks
import "./tasks/deploy";
import "./tasks/emit";
import "./tasks/decrypt";
import "./tasks/listen";

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sapphire_localnet: {
      url: "http://localhost:8545",
      chainId: 0x5afd,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    sapphire_testnet: {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 0x5aff,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    sapphire: {
      url: "https://sapphire.oasis.io",
      chainId: 0x5afe,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
