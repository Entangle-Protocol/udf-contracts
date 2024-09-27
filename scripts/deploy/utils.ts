import hre from "hardhat";
import _ from "lodash";
import assert from "assert";
import inquirer from "inquirer";
import { createProvider } from "hardhat/internal/core/providers/construction";
import { HardhatConfig, NetworkConfig } from "hardhat/types";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider"

export async function setupNetwork(net: string) {
    const url = _.get(hre.userConfig, `networks.${net}.url`, "");
    assert(url, `No url for network ${net}`);

    let hardhatConfig = hre.config as HardhatConfig;
    hardhatConfig.defaultNetwork = net;
    const networkConfig = hardhatConfig.networks[net] as NetworkConfig;

    const provider = await createProvider(
        hardhatConfig,
        net,
        hre.artifacts,
    );

    hre.network.name = net;
    hre.network.provider = provider;
    hre.network.config = networkConfig;
    hre.ethers.provider = new HardhatEthersProvider(hre.network.provider, hre.network.name);
}
export async function allNetworks() {
    return _.chain(hre.userConfig.networks)
        .toPairs()
        .filter(([_, e]) => !e?.disabled)
        .map(([k, _]) => k)
        .flatten()
        .value();
}

/*
 * Types and functions for oracle network keys
 */

const ValidOracleNetworkKeys = ["tent", "entangle"] as const;

export type OracleNetworkKey = typeof ValidOracleNetworkKeys[number];

export function allOracleNetworks(): readonly string[] {
    return ValidOracleNetworkKeys;
}

export function isOracleNetwork(net: OracleNetworkKey): boolean {
    return ValidOracleNetworkKeys.includes(net);
}

export function isTestnetOracleKey(net: OracleNetworkKey): boolean {
    return net === "tent";
}

export async function askToProceed(): Promise<boolean> {
    const answer = await inquirer.prompt([
        {
            type: "confirm",
            name: "proceed",
            message: "Do you want to proceed?",
        },
    ]);

    return answer.proceed;
}
