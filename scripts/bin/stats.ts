import hre from "hardhat";
import inquirer from "inquirer";
import process from "node:process";
import {
    setupNetwork,
    allNetworks,
    allOracleNetworks,
} from "../deploy/utils";
import {
    loadPriceStreamConfig,
    loadDestinationContracts,
    MERKLE_SIGS_SOURCE_ID,
} from "../deploy/config";
import {
    printAssetInfo,
    printVotes,
    printMerkleVotes,
    printProtocolInfo,
    printPullOracleInfo,
    printNativeBalance,
} from "../stats/";


function formatGasPrice(price: string): string {
    const priceInt = parseInt(price);
    if (!isNaN(priceInt)) {
        const GAS_SCALE = 100000;
        const priceFloat = (priceInt * GAS_SCALE) / 10**18;
        return priceFloat.toString() + " USD for 100k GAS";
    }
    return price;
}

const formatPrice = (price: string): string => {
    const priceInt = parseInt(price);
    if (!isNaN(priceInt)) {
        const priceFloat = priceInt / 10**18;
        return priceFloat.toString();
    }
    return price;
}

export async function runStatsCmd() {
    let [admin,] = await hre.ethers.getSigners();
    console.log("admin", admin.address);
    const printAssetInfoChoice = "Print asset info";
    const printTransmitterVotesChoice = "Print transmitter votes";
    const printMerkleRootVotes = "Print MerkleRoot votes";
    const printProtocolInfoChoice = "Print protocol info";
    const printPullOralceInfoChoice = "Print PullOralce info";
    const printEOABalance = "Print EOA native balance";

    function priceFormat(sourceID: string, price: string): string {
        if (
            sourceID.startsWith("prices-feed") ||
            sourceID.startsWith("integrator-feed")
        ) {
            return formatPrice(price);
        } else if (sourceID.startsWith("gas-feed")) {
            return formatGasPrice(price);
        }

        return price;
    }

    function priceFormatByDataKey(dataKey: string, price: string): string {
        // Handle gas formatting
        if (dataKey.startsWith("GAS")) {
            return formatGasPrice(price);
        }

        // Handle price-feed uint256 prices (search for / between tokens not longer than 5 chars)
        const parts = dataKey.split("/");
        if (parts.length === 2 && parts[0].length <= 5 && parts[1].length <= 5) {
            return formatPrice(price);
        }

        return price;
    }

    const { action } = await inquirer.prompt([
        {
            type: "list",
            name: "action",
            message: "Choose stat action",
            choices: [
                printProtocolInfoChoice,
                printAssetInfoChoice,
                printTransmitterVotesChoice,
                printMerkleRootVotes,
                printEOABalance,
                printPullOralceInfoChoice,
            ],
        },
    ]);

    // First handle actions that don't require oracle network selection
    // Which is:
    // * printEOABalance
    if (action === printEOABalance) {
        let networks = await allNetworks();

        // Ask for destination chains
        const { scope } = await inquirer.prompt([
            {
                type: "checkbox",
                name: "scope",
                message: "Scope?",
                choices: networks,
                default: networks,
            },
        ]);
        if (scope.length === 0) {
            console.log("No networks selected");
            return
        }

        // Ask for EOA address
        const { eoaAddress } = await inquirer.prompt([
            {
                type: "input",
                name: "eoaAddress",
                message: "Enter EOA address:",
            },
        ]);

        for (const network of scope) {
            await setupNetwork(network);
            await printNativeBalance(eoaAddress, network);
        }
    } else {

        // Handle the other cases that require oracle network selection
        const { oracleChainKey } = await inquirer.prompt([
            {
                type: "list",
                name: "oracleChainKey",
                message: "Choose oracle chain",
                choices: allOracleNetworks(),
            },
        ]);

        if (action === printAssetInfoChoice) {
            setupNetwork(oracleChainKey);
            const config = loadPriceStreamConfig(oracleChainKey);
            await printAssetInfo(oracleChainKey, config.protocolID, config.spotters, priceFormat);
        } else if (action === printTransmitterVotesChoice) {
            setupNetwork(oracleChainKey);
            const config = loadPriceStreamConfig(oracleChainKey);
            const protocolID = config.protocolID;
            const spotters = config.spotters;
            const transmitters = config.manualTransmitters;
            await printVotes(oracleChainKey, protocolID, spotters, transmitters, priceFormat);
        } else if (action === printMerkleRootVotes) {
            setupNetwork(oracleChainKey);
            const { merkleRoot } = await inquirer.prompt([
                {
                    type: "input",
                    name: "merkleRoot",
                    message: "Enter MerkleRoot:",
                },
            ]);
            const config = loadPriceStreamConfig(oracleChainKey);
            const protocolID = config.protocolID;
            const transmitters = config.manualTransmitters;
            await printMerkleVotes(oracleChainKey, protocolID, transmitters, merkleRoot);
        } else if (action === printProtocolInfoChoice) {
            setupNetwork(oracleChainKey);
            const config = loadPriceStreamConfig(oracleChainKey);
            const protocolID = config.protocolID;
            // const spotters = config.spotters;
            // const transmitters = config.manualTransmitters;
            await printProtocolInfo(oracleChainKey, protocolID);
        } else if (action === printPullOralceInfoChoice) {
            const destContracts = loadDestinationContracts(oracleChainKey);

            // Filter network to only those where PullOracle contract is deployed
            let networks = await allNetworks();
            networks = networks.filter((net: any) => destContracts[net] !== undefined);

            // Ask for destination chains
            const { scope } = await inquirer.prompt([
                {
                    type: "checkbox",
                    name: "scope",
                    message: "Scope?",
                    choices: networks,
                    default: networks,
                },
            ]);

            const config = loadPriceStreamConfig(oracleChainKey);
            let dataKeys: string[] = [];

            // Get datakeys from "prices-feed" spotter in the config
            for (let spotter of config.spotters) {
                if (spotter.sourceID === MERKLE_SIGS_SOURCE_ID) {
                    continue
                }

                dataKeys = dataKeys.concat(spotter.allowedKeys);
            }
            if (dataKeys.length === 0) {
                throw new Error("No datakeys found in config");
            }

            for (let network of scope) {
                await setupNetwork(network);
                console.log("Pull Oracle info on network", network);
                await printPullOracleInfo(
                    destContracts[network].PullOracle,
                    dataKeys,
                    priceFormatByDataKey
                );
            }
        } else {
            console.error("Unknown action", action);
            process.exit(1)
        }
    }

    console.log("Stats done");
}
