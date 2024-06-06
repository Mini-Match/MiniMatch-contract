require("dotenv").config();
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require('hardhat-deploy');
require("hardhat-deploy-ethers");
require("@nomicfoundation/hardhat-foundry");
require("./scripts/tasks");

const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1;
const PUBLIC_KEY_1 = process.env.PUBLIC_KEY_1;

const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2;
const PUBLIC_KEY_2 = process.env.PUBLIC_KEY_2;

const PRIVATE_KEY_3 = process.env.PRIVATE_KEY_3;
const PUBLIC_KEY_3 = process.env.PUBLIC_KEY_3;

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
        viaIR: true,
      },
    ],
  },
  defaultNetwork: "hardhat",
  namedAccounts: {
    manager: {
      default: 0, // first account in signers list
      rinkeby: PUBLIC_KEY_1,
      polygon: PUBLIC_KEY_1,
      goerli: PUBLIC_KEY_1,
      polygon_testnet: PUBLIC_KEY_1,
    },
    player1: {
      default: 1, // second account in signers list
      rinkeby: PUBLIC_KEY_2,
      polygon: PUBLIC_KEY_2,
      goerli: PUBLIC_KEY_2,
      polygon_testnet: PUBLIC_KEY_2,
    },
    player2: {
      default: 2, // 3rd account in signers list
      rinkeby: PUBLIC_KEY_3,
      polygon: PUBLIC_KEY_3,
      goerli: PUBLIC_KEY_3,
      polygon_testnet: PUBLIC_KEY_3,
    },
    house: {
      default: 1, // second account in signers list
      rinkeby: PUBLIC_KEY_2,
      polygon: PUBLIC_KEY_2,
      goerli: PUBLIC_KEY_2,
      polygon_testnet: PUBLIC_KEY_2,
    },
  },
  mocha: {
    timeout: 0,
  },
  networks: {
    hardhat: {
      gas: 1000000000,
      blockGasLimit: 1000000000,
      gasPrice: 1000000000,
    },
    localhost: {
      timeout: 60000,
    },
    polygon_testnet: {
      url: "https://matic-mumbai.chainstacklabs.com",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    },
    polygon: {
      url: "https://polygon-rpc.com/",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    },
    rinkeby: {
      // deprecated
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_ID}`,
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    },
    bsc: {
      url: `https://bsc-dataseed.binance.org`,
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    },
    bsc_testnet: {
      url: `https://data-seed-prebsc-1-s1.binance.org:8545`,
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    },
    base: {
      url: "https://mainnet.base.org/",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    },
    base_sepolia: {
      url: "https://sepolia.base.org",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3],
    }
  },
  etherscan: {
    // API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
