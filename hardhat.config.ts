import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades";
// import "@entangle_protocol/oracle-sdk/dist/src/plugin";
import "./scripts/bin";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            // {
            //     version: '0.8.24',
            //     settings: {
            //         optimizer: {
            //             enabled: true,
            //             runs: 0,
            //         },
            //         viaIR: true,
            //     },
            // },
            {
                version: '0.8.19',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 0,
                    },
                    viaIR: true,
                },
            }
        ]
    },
    networks: {
        eth_sepolia: {
            chainId: 11155111,
            url: process.env.ETH_SEPOLIA_URL || "",
            accounts: [ process.env.TESTNET_PROTOCOL_ADMIN! ],
        },
        mantle_sepolia: {
            chainId: 5003,
            url: process.env.MANTLE_SEPOLIA_URL || "",
            accounts: [ process.env.TESTNET_PROTOCOL_ADMIN! ],
        },
        ethereum: {
            chainId: 1,
            url: process.env.MAINNET_ETH_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        mantle: {
            chainId: 5000,
            url: process.env.MAINNET_MANTLE_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        binance: {
            chainId: 56,
            url: process.env.MAINNET_BINANCE_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        base: {
            chainId: 8453,
            url: process.env.MAINNET_BASE_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        arbitrum: {
            chainId: 42161,
            url: process.env.MAINNET_ARBITRUM_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        blast: {
            chainId: 81457,
            url: process.env.MAINNET_BLAST_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        linea: {
            chainId: 59144,
            url: process.env.MAINNET_LINEA_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        core : {
            chainId: 1116,
            url: process.env.MAINNET_CORE_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        xlayer : {
            chainId: 196,
            url: process.env.MAINNET_XLAYER_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        optimism : {
            chainId: 10,
            url: process.env.MAINNET_OPTIMISM_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        entangle: {
            chainId: 33033,
            url: process.env.MAINNET_ENTANGLE_URL || "",
            accounts: [ process.env.PROTOCOL_ADMIN! ],
        },
        tent: {
            chainId: 33133,
            url: process.env.ENT_URL || "",
            accounts: [ process.env.TESTNET_PROTOCOL_ADMIN! ],
        }
    },
    etherscan: {
        // apiKey: process.env.ETHERSCAN_API_KEY || "",
        apiKey: {
            // Mainnet
            mainnet: process.env.ETHERSCAN_API_KEY || "",
            bsc: process.env.BSCSCAN_API_KEY || "",
            base: process.env.BASESCAN_API_KEY || "",
            arbitrumOne: process.env.ARBISCAN_API_KEY || "",
            mantle: process.env.ETHERSCAN_API_KEY || "",
            blast: process.env.BLAST_API_KEY || "",
            linea: process.env.LINEA_API_KEY || "",
            core: process.env.CORESCAN_API_KEY || "",
            xlayer: process.env.OKLINK_API_KEY || "",
            optimisticEthereum: process.env.OPTIMISM_API_KEY || "",

            // Testnet
            sepolia: process.env.ETHERSCAN_API_KEY || "",
            mantleSepolia: process.env.ETHERSCAN_API_KEY || ""
        },
        customChains: [
            {
                network: "mantle",
                chainId: 5000,
                urls: {
                    apiURL: "https://explorer.mantle.xyz/api",
                    browserURL: "https://explorer.mantle.xyz"
                }
            },
            {
                network: "blast",
                chainId: 81457,
                urls: {
                    apiURL: "https://api.blastscan.io/api",
                    browserURL: "https://blastscan.io"
                }
            },
            {
                network: "linea",
                chainId: 59144,
                urls: {
                    apiURL: "https://api.lineascan.build/api",
                    browserURL: "https://lineascan.build/"
                }
            },
            {
                network: "core",
                chainId: 1116,
                urls: {
                    apiURL: "https://openapi.coredao.org/api",
                    browserURL: "https://scan.coredao.org/"
                }
            },
            {
                network: "xlayer",
                chainId: 196,
                urls: {
                    apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER",
                    browserURL: "https://www.oklink.com/xlayer"
                }
            },
            {
                network: "mantleSepolia",
                chainId: 5003,
                urls: {
                    apiURL: "https://explorer.sepolia.mantle.xyz/api",
                    browserURL: "https://explorer.sepolia.mantle.xyz"
                }
            }
        ]
    }
};

export default config;
