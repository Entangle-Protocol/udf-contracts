import hre, { ethers, upgrades } from "hardhat";
import {
    TransmittersParams,
    ProtocolParams,
} from "@entangle_protocol/oracle-sdk";
import {
    StreamDataSpotterFactory,
    StreamDataSpotterFactory__factory,
    ExternalDeveloperHub,
    ExternalDeveloperHub__factory,
    StreamDataSpotter,
    StreamDataSpotter__factory,
    MasterStreamDataSpotter,
    MasterStreamDataSpotter__factory,
    GlobalConfig,
    GlobalConfig__factory,
} from "@entangle_protocol/oracle-sdk/dist/typechain-types";
import {
    PullOracle,
    PullOracle__factory
} from "../../typechain-types";
import TestnetPriceStreamConfig from "./config/tent/PriceStreamDataConfig.json";
import MainnetPriceStreamConfig from "./config/entangle/PriceStreamDataConfig.json";
import photonAddresses from "./config/photon_addresses.json";
import { OracleNetworkKey, isOracleNetwork } from "./utils";
import path from "path";
import fs from "fs";

export const MERKLE_SIGS_SOURCE_ID = "merkle-sigs";
export const DESTINATION_ADDRESSES_PATH = path.join(__dirname, "./dump/datafeeds_target_addresses.json");

export interface PriceStreamConfig {
    protocolID: string;
    manualTransmitters: string[];
    proposers: string[];
    spotters: {
        sourceID: string;
        consensusRate: number;
        minFinalizationInterval: number;
        onlyAllowedKeys: boolean;
        allowedKeys: string[];
    }[];
    protocolParams: ProtocolParams;
    transmittersParams: TransmittersParams;
}

export interface DestinationContracts {
    PullOracle: string;
}

export function loadPriceStreamConfig(network: OracleNetworkKey): PriceStreamConfig {
    if (network === "tent") {
        return TestnetPriceStreamConfig;
    } else if (network === "entangle") {
        return MainnetPriceStreamConfig;
    }

    throw new Error(`Unknown oracle network: ${network}`);
}

export function loadPhotonAddresses(): typeof photonAddresses {
    return photonAddresses;
}

export function getDestinationContractsPath(network: OracleNetworkKey): string {
    if (!isOracleNetwork(network)) {
        throw new Error(`Unknown oracle network: ${network}`);
    }

    return path.join(__dirname, `./dump/${network}_datafeeds_target_addresses.json`);
}

export function loadDestinationContracts(
    network: OracleNetworkKey,
): Record<string, DestinationContracts> {
    const p = getDestinationContractsPath(network);
    return JSON.parse(
        fs.readFileSync(p, "utf8")
    );
}

export function dumpDestinationContracts(
    network: OracleNetworkKey,
    destContracts: Record<string, DestinationContracts>
) {
    const p = getDestinationContractsPath(network);
    fs.writeFileSync(
        p,
        JSON.stringify(destContracts, null, 2)
    );
    console.log("Dumped destination contracts to: ", p);
}

export async function bindExternalDeveloperHub(
    edhAddress: string
): Promise<ExternalDeveloperHub> {
    const edh = await ethers.getContractAt(
        ExternalDeveloperHub__factory.abi as any[],
        edhAddress,
    );
    return edh as unknown as ExternalDeveloperHub;
}

export async function bindStreamDataSpotterFactory(
    factoryAddress: string
): Promise<StreamDataSpotterFactory> {
    const streamDataSpotterFactory = await ethers.getContractAt(
        StreamDataSpotterFactory__factory.abi as any[],
        factoryAddress,
    );
    return streamDataSpotterFactory as unknown as StreamDataSpotterFactory;
}

export async function bindMasterStreamDataSpotter(
    masterAddress: string
): Promise<MasterStreamDataSpotter> {
    const masterStreamDataSpotter = await ethers.getContractAt(
        MasterStreamDataSpotter__factory.abi as any[],
        masterAddress,
    );
    return masterStreamDataSpotter as unknown as MasterStreamDataSpotter;
}

export async function bindStreamDataSpotter(
    spotterAddress: string
): Promise<StreamDataSpotter> {
    const streamDataSpotter = await ethers.getContractAt(
        StreamDataSpotter__factory.abi as any[],
        spotterAddress,
    );
    return streamDataSpotter as unknown as StreamDataSpotter;
}

export async function bindGlobalConfig(
    globalConfigAddress: string
): Promise<GlobalConfig> {
    const globalConfig = await ethers.getContractAt(
        GlobalConfig__factory.abi as any[],
        globalConfigAddress,
    );
    return globalConfig as unknown as GlobalConfig;
}

export async function bindPullOracle(
    pullOracleAddress: string
): Promise<PullOracle> {
    const pullOracle = await ethers.getContractAt(
        PullOracle__factory.abi as any[],
        pullOracleAddress,
    );
    return pullOracle as unknown as PullOracle;
}
