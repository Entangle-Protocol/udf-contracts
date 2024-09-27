import hre, { ethers, upgrades } from "hardhat";
import _ from "lodash";
import assert from "assert";
import { BaseContract, ContractFactory } from "ethers";
import {
    ProtocolBuilder,
    EOB_TEST_CHAIN_ID,
    EOB_MAIN_CHAIN_ID,
} from "@entangle_protocol/oracle-sdk";
import {
    StreamDataSpotterFactory,
    StreamDataSpotterFactory__factory,
    MasterStreamDataSpotter,
    ExternalDeveloperHub,
    StreamDataSpotter__factory,
    GlobalConfig,
} from "@entangle_protocol/oracle-sdk/dist/typechain-types";
import { HardhatEthersSigner, SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    isOracleNetwork,
    OracleNetworkKey,
    isTestnetOracleKey,
    askToProceed,
} from "./utils";
import {
    DESTINATION_ADDRESSES_PATH,
    PriceStreamConfig,
    DestinationContracts,
    loadPriceStreamConfig,
    loadPhotonAddresses,
    bindStreamDataSpotterFactory,
    bindMasterStreamDataSpotter,
    bindExternalDeveloperHub,
    bindGlobalConfig,
    loadDestinationContracts,
    dumpDestinationContracts,
} from "./config"
import { expect } from "chai";
import fs from "fs";
import path from "path";

import {
    PriceSpotterProcessingLib,
    PullOracle,
    SignaturesProcessingLib
} from "../../typechain-types";

const SIGNATURES_SOURCE_ID = "merkle-sigs"

function getDeploymentDumpPath(network: OracleNetworkKey): string {
    return path.join(__dirname, `./dump/${network}_deployment_dump.json`);
}

export interface ProtocolDump {
    protocolID: string;
    manualTransmitters?: string[];
    proposers?: string[];
    spotters?: {
        sourceID: string;
        processingLib: string;
        spotter: string;
    }[];
}

async function deployPriceProcessingLib(signer: SignerWithAddress): Promise<PriceSpotterProcessingLib> {
    const PriceSpotterProcessingLibFactory = await ethers.getContractFactory("PriceSpotterProcessingLib", signer);
    const lib = await upgrades.deployProxy(
        PriceSpotterProcessingLibFactory,
        [[signer.address]],
        {
            kind: "uups",
        }
    );
    await lib.waitForDeployment();
    expect(await lib.getAddress()).to.not.eq(ethers.ZeroAddress);

    return lib as unknown as PriceSpotterProcessingLib;
}

async function deploySignaturesProcessingLib(signer: SignerWithAddress): Promise<SignaturesProcessingLib> {
    const SignaturesProcessingLibFactory = await ethers.getContractFactory("SignaturesProcessingLib", signer);
    const lib = await upgrades.deployProxy(
        SignaturesProcessingLibFactory,
        [[signer.address]],
        {
            kind: "uups",
        }
    );
    await lib.waitForDeployment();
    expect(await lib.getAddress()).to.not.eq(ethers.ZeroAddress);

    return lib as unknown as SignaturesProcessingLib;
}

export async function deployPullOracle(
    signer: SignerWithAddress,
    protocolID: string,
    endPointAddress: string
): Promise<PullOracle> {
    const PullOracleContract = await ethers.getContractFactory("PullOracle", signer);
    const pullOracle = await upgrades.deployProxy(
        PullOracleContract,
        [protocolID, endPointAddress],
        { kind: "uups" }
    );
    await pullOracle.waitForDeployment();
    expect(await pullOracle.getAddress()).to.not.eq(ethers.ZeroAddress);
    console.log(`Deployed PullOracle at ${await pullOracle.getAddress()}`);

    return pullOracle as unknown as PullOracle;
}

export async function upgradePullOracle(
    pullOracleAddress: string,
): Promise<any> {

    // Validate upgrade
    const oldImplementation = await upgrades.erc1967.getImplementationAddress(pullOracleAddress);
    console.log(`Old implementation address: ${oldImplementation}`);
    let newPullOracle = await ethers.getContractFactory("PullOracle");
    await upgrades.validateImplementation(newPullOracle);
    await upgrades.validateUpgrade(pullOracleAddress, newPullOracle);
    console.log("Validated upgrade for PullOracle");

    // Ask to proceed
    const proceed = await askToProceed();
    if (!proceed) {
        console.error("Exiting upgrade for PullOracle");
        throw new Error("Upgrade for PullOracle cancelled");
    }

    const newProxy = await upgrades.upgradeProxy(
        pullOracleAddress, 
        newPullOracle,
    )
    await newProxy.waitForDeployment();
    const newImplementation = await upgrades.erc1967.getImplementationAddress(pullOracleAddress);
    console.log("New implementation deployed to:", newImplementation)
}

export type PriceStreamChainData = {
    chainId: number;
    spotter: string;
}

export class PriceStreamDataDeployment {
    public config: PriceStreamConfig;
    public oracleKey: OracleNetworkKey;
    public photonContracts: Record<string, Record<string, string>> = {};
    public destinationContracts: Record<string, DestinationContracts> = {};
    public dump: ProtocolDump;

    constructor(_signer: SignerWithAddress, oracleKey: OracleNetworkKey) {
        // Ensure that the key is oracle network
        if (!isOracleNetwork(oracleKey)) {
            throw new Error(`Invalid oracle network ${oracleKey}`);
        }
        this.oracleKey = oracleKey;

        this.config = loadPriceStreamConfig(this.oracleKey);
        console.log(`Loaded PriceStreamDataConfig`);
        console.log(this.config);

        this.dump = {
            protocolID: this.config.protocolID,
            spotters: [],
        };
    }

    private async getGlobalConfigContract(): Promise<GlobalConfig> {
        return bindGlobalConfig(this.photonContracts[this.oracleKey]!.GlobalConfig!);
    }

    private async getStreamDataSpotterFactoryContract(): Promise<StreamDataSpotterFactory> {
        return bindStreamDataSpotterFactory(this.photonContracts[this.oracleKey]!.StreamDataSpotterFactory!);
    }

    private async getMasterStreamDataSpotterContract(): Promise<MasterStreamDataSpotter> {
        return bindMasterStreamDataSpotter(this.photonContracts[this.oracleKey]!.MasterStreamDataSpotter!);
    }

    private getEndPointAddress(): string | undefined {
        return this.photonContracts[hre.network.name]?.EndPoint;
    }

    private async getExternalDeveloperHubContract(): Promise<ExternalDeveloperHub> {
        return bindExternalDeveloperHub(this.photonContracts[this.oracleKey]!.ExternalDeveloperHub!);
    }

    async registerOnMAS(signer: HardhatEthersSigner) {
        // Make sure we're on the EOB chain
        const chainId = (await hre.ethers.provider.getNetwork()).chainId;
        if (chainId !== EOB_TEST_CHAIN_ID && chainId !== EOB_MAIN_CHAIN_ID) {
            throw new Error(`Catched bad deployment on non-EOB chain ${chainId}`);
        }
        const protocol = await this.getProtocol(signer);

        // First allow ExternalDeveloperHub to spend NGL
        // Get global config from ExternalDeveloperHub
        const globalConfig = await this.getGlobalConfigContract();
        console.log(`globalConfig: ${await globalConfig.getAddress()}`);

        console.log(`Registering protocol ${this.config.protocolID} on MAS`);
        let tx = await protocol.verifyOrCreate(signer.address);
        if (tx === undefined) {
            console.log(`Protocol ${this.config.protocolID} already registered on MAS`);
            return
        } else {
            console.log(`Registered protocol ${this.config.protocolID} on MAS, tx: ${tx?.hash}`);
        }

        this.dump!.protocolID = this.config.protocolID;
        this.dump!.manualTransmitters = this.config.manualTransmitters;
        this.dump!.proposers = this.config.proposers;
        await this.dumpDeployInfo();
    }

    async registerTargetChains(signer: HardhatEthersSigner, chainIDs: bigint[] = []) {
        // Make sure we're on the EOB chain
        const chainId = (await hre.ethers.provider.getNetwork()).chainId;
        if (chainId !== EOB_TEST_CHAIN_ID && chainId !== EOB_MAIN_CHAIN_ID) {
            throw new Error(`Catched bad deployment on non-EOB chain ${chainId}`);
        }
        const encodedProtocolID = ethers.encodeBytes32String(this.config.protocolID);

        // Add dummy (0x00..01) protocol address to all provided chainIDs
        // (for protocol initialization on dest chains)
        const edh = await this.getExternalDeveloperHubContract();
        const dummyAddress = "0x0000000000000000000000000000000000000001";
        const encodedDummyAddress = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [dummyAddress]);
        for (const chainId of chainIDs) {
            let tx = await edh.connect(signer).addAllowedProtocolAddress(
                encodedProtocolID,
                chainId,
                encodedDummyAddress
            );
            await tx.wait();
            console.log(`Added empty proposer to chain ${chainId} with tx ${tx.hash}`);
        }

        console.log("Registered on target chains", chainIDs)
    }

    async registerTargetChainSolana(signer: HardhatEthersSigner) {
        // Make sure we're on the EOB chain
        const chainId = (await hre.ethers.provider.getNetwork()).chainId;
        if (chainId !== EOB_TEST_CHAIN_ID && chainId !== EOB_MAIN_CHAIN_ID) {
            throw new Error(`Catched bad deployment on non-EOB chain ${chainId}`);
        }
        const encodedProtocolID = ethers.encodeBytes32String(this.config.protocolID);

        const SOLANA_CHAIN_ID = 100000000000000000000n;
        const edh = await this.getExternalDeveloperHubContract();
        const dummySolAddress = "0x0000000000000000000000000000000000000000000000000000000000000001";
        let tx = await edh.connect(signer).addAllowedProtocolAddress(
            encodedProtocolID,
            SOLANA_CHAIN_ID,
            dummySolAddress
        );
        await tx.wait();
        console.log(`Added empty proposer to chain ${chainId} with tx ${tx.hash}`);
    }

    async registerFinalizers(signer: HardhatEthersSigner) {
        const chainId = (await hre.ethers.provider.getNetwork()).chainId;
        if (chainId !== EOB_TEST_CHAIN_ID && chainId !== EOB_MAIN_CHAIN_ID) {
            throw new Error(`Catched bad deployment on non-EOB chain ${chainId}`);
        }

        const factory = await this.getStreamDataSpotterFactoryContract();
        const protocolID = this.config.protocolID;
        const encodedProtocolID = ethers.encodeBytes32String(protocolID);

        console.log(`Adding finalizers to protocol ${protocolID}`);
        for (const finalizerAddress of this.config.proposers) {
            console.log(`Adding finalizer ${finalizerAddress}`);
            const tx = await factory.connect(signer).addFinalizer(encodedProtocolID, finalizerAddress);
            await tx.wait();
        }
    }

    async depositToProtocol(signer: HardhatEthersSigner, depositAmount: bigint) {
        const edh = await this.getExternalDeveloperHubContract();
        const encodedProtocolID = ethers.encodeBytes32String(this.config.protocolID);

        console.log(`Depositing ${depositAmount} NGL to protocol`);
        let tx = await edh.connect(signer).deposit(encodedProtocolID, depositAmount)
        await tx.wait();
        console.log(`Successfully deposited ${depositAmount} NGL to protocol`);
    }

    private async getProtocol(signer: HardhatEthersSigner) {
        const isTestnet = isTestnetOracleKey(this.oracleKey);
        const builder = new ProtocolBuilder(
            this.config.protocolID,
            this.config.manualTransmitters,
            this.config.transmittersParams,
            this.config.protocolParams,
            isTestnet
        ).withSigner(signer);
        const protocol = await builder.build();
        return protocol;
    }

    async deployPullOracle(signer: SignerWithAddress) {
        const endPointAddress = this.getEndPointAddress()!;
        const encodedProtocolID = ethers.encodeBytes32String(this.config.protocolID);
        const pullOracle = await deployPullOracle(
            signer,
            encodedProtocolID,
            endPointAddress
        );
        if (this.destinationContracts[hre.network.name] === undefined) {
            this.destinationContracts[hre.network.name] = {};
        }

        this.destinationContracts[hre.network.name]["PullOracle"] = await pullOracle.getAddress();
        this.dumpDestinationContracts();
    }

    async upgradeAllowedKeys(signer: HardhatEthersSigner) {
        const masterSpotter = await this.getMasterStreamDataSpotterContract();
        const factory = await this.getStreamDataSpotterFactoryContract();
        const encodedProtocolID = ethers.encodeBytes32String(this.config.protocolID);

        // For each spotter in the config, upgrade allowed keys
        for (const spotterConfig of this.config.spotters) {

            // If spotter is merkle-sigs or onlyAllowedKeys == false, or allowedKeys is empty, skip
            if (
                spotterConfig.sourceID == SIGNATURES_SOURCE_ID ||
                !spotterConfig.onlyAllowedKeys ||
                spotterConfig.allowedKeys.length == 0) {
                console.log(`Skipping upgrade for sourceID ${spotterConfig.sourceID}`);
                continue;
            }


            // Check that keys are not the same already on the EOB

            // Fetch current allowed keys
            const encodedSourceID = ethers.encodeBytes32String(spotterConfig.sourceID);
            const currentAllowedKeys = await masterSpotter.getAllowedKeys(
                encodedProtocolID,
                encodedSourceID
            )
            const encodedAllowedKeys = spotterConfig.allowedKeys.map((k) => ethers.encodeBytes32String(k));

            // Check if keys differ
            let keysDiffer = false;
            if (currentAllowedKeys.length != encodedAllowedKeys.length) {
                keysDiffer = true;
            } else {
                for (let i = 0; i < spotterConfig.allowedKeys.length; i++) {
                    if (currentAllowedKeys[i] != encodedAllowedKeys[i]) {
                        keysDiffer = true;
                        break;
                    }
                }
            }

            // Skip upgrade if keys are the same
            if (!keysDiffer) {
                console.log(`Skipping upgrade for sourceID ${spotterConfig.sourceID}, allowed keys are the same`);
                continue;
            }

            // Set allowed keys to new keys
            let tx = await factory.connect(signer).setAllowedKeys(
                encodedProtocolID,
                encodedSourceID,
                encodedAllowedKeys
            );
            await tx.wait();
            console.log(`Upgraded allowed keys for sourceID ${spotterConfig.sourceID}, tx: ${tx.hash}`);
        }
    }

    async upgradePullOracle() {
        const pullOracleAddress = this.destinationContracts[hre.network.name]["PullOracle"];
        await upgradePullOracle(pullOracleAddress);
        console.log("Upgrade complete for PullOracle");
    }

    async upgradeProtocolSpotters(signer: HardhatEthersSigner) {
        console.log(`Upgrading protocol spotters for protocol ${this.config.protocolID}`);
        // Make sure we're on the EOB chain
        const chainId = (await hre.ethers.provider.getNetwork()).chainId;
        if (chainId !== EOB_TEST_CHAIN_ID && chainId !== EOB_MAIN_CHAIN_ID) {
            throw new Error(`Catched bad deployment on non-EOB chain ${chainId}`);
        }

        const factory = await this.getStreamDataSpotterFactoryContract();
        const protocolID = this.config.protocolID;

        for (const spotterConfig of this.config.spotters) {
            // Parse necessary data from config
            const sourceID = spotterConfig.sourceID!;

            const encodedProtocolID = ethers.encodeBytes32String(protocolID);
            const encodedSourceID = ethers.encodeBytes32String(sourceID);

            // Check that spotter with sourceID does not exist
            let spotterAddress = await factory.getSpotter(
                encodedProtocolID,
                encodedSourceID
            );

            if (spotterAddress === ethers.ZeroAddress) {
                console.log(`Spotter for sourceID ${sourceID} already exists at ${spotterAddress}`);
                continue;
            }

            console.log(`Upgrading spotter for sourceID ${sourceID}, ${spotterAddress}`);

            // console.log(StreamDataSpotter__factory);
            const spotter = await ethers.getContractAt(
                StreamDataSpotter__factory.abi,
                spotterAddress
            );
            const processingLibAddress = await spotter.processingLib();

            const oldImplementation = await upgrades.erc1967.getImplementationAddress(processingLibAddress);
            console.log(`Old implementation address: ${oldImplementation}`);

            // Get correct processingLib
            let newProcessingLib: ContractFactory;
            if (sourceID == SIGNATURES_SOURCE_ID) {
                newProcessingLib = await ethers.getContractFactory("SignaturesProcessingLib");
            } else {
                newProcessingLib = await ethers.getContractFactory("PriceSpotterProcessingLib");
            }

            await upgrades.validateImplementation(newProcessingLib);
            await upgrades.validateUpgrade(processingLibAddress, newProcessingLib)

            console.log("Validated upgrade for processing lib");
            const proceed = await askToProceed();
            if (!proceed) {
                console.log("Skipping upgrade for processing lib");
                continue;
            }

            console.log(`Upgrading processing lib for spotter ${spotterAddress}`);
            const newProxy = await upgrades.upgradeProxy(
                processingLibAddress, 
                newProcessingLib,
            )
            await newProxy.waitForDeployment();

            const new_implementation = await upgrades.erc1967.getImplementationAddress(processingLibAddress);
            console.log("New implementation deployed to:", new_implementation)
            console.log(`Upgrade complete for sourceID ${sourceID}`);
        }
    }

    // Deploy Data spotters for protocol defined in config file
    // './config/PriceStreamDataConfig.json'
    async registerProtocolSpotters(signer: HardhatEthersSigner) {
        console.log(`Deployng protocol spotters for protocol ${this.config.protocolID}`);
        // Make sure we're on the EOB chain
        const chainId = (await hre.ethers.provider.getNetwork()).chainId;
        if (chainId !== EOB_TEST_CHAIN_ID && chainId !== EOB_MAIN_CHAIN_ID) {
            throw new Error(`Catched bad deployment on non-EOB chain ${chainId}`);
        }

        const factory = await this.getStreamDataSpotterFactoryContract();
        const protocolID = this.config.protocolID;

        // Try to deploy spotters for each defined spotter in the config
        for (const spotterConfig of this.config.spotters) {
            console.log(`Deploying spotter for sourceID ${spotterConfig.sourceID}`);

            // Parse necessary data from config
            const sourceID = spotterConfig.sourceID!;
            const onlyAllowedKeys = spotterConfig.onlyAllowedKeys!;
            const allowedKeys = spotterConfig.allowedKeys ?? [];
            if (onlyAllowedKeys) {
                assert(allowedKeys.length > 0, "Allowed keys cannot be empty, since onlyAllowedKeys is true");
            }
            const encodedAllowedKeys = allowedKeys.map((k) => ethers.encodeBytes32String(k));
            const spotterConsensusRate = spotterConfig.consensusRate!;
            const minFinalizationInterval = spotterConfig.minFinalizationInterval!;

            const encodedProtocolID = ethers.encodeBytes32String(protocolID);
            const encodedSourceID = ethers.encodeBytes32String(sourceID);

            // Check that spotter with sourceID does not exist
            let spotterAddress = await factory.getSpotter(
                encodedProtocolID,
                encodedSourceID
            );
            if (spotterAddress !== ethers.ZeroAddress) {
                console.log(`Spotter for sourceID ${sourceID} already exists at ${spotterAddress}`);
                continue;
            }

            let processingLib: BaseContract;
            console.log(`Deploying processing lib for sourceID ${sourceID}`);

            if (sourceID == SIGNATURES_SOURCE_ID) {
                // If we're deploying special spotter for merkle-sigs aggregation, deploy it with SignaturesProcessingLib
                processingLib = await deploySignaturesProcessingLib(signer)
                console.log(`Deployed SignaturesProcessingLib at ${await processingLib.getAddress()}`);
            } else {
                // Deploy default processing lib (PriceSpotterProcessingLib) for new spotter
                processingLib = await deployPriceProcessingLib(signer)
                console.log(`Deployed PriceSpotterProcessingLib at ${await processingLib.getAddress()}`);
            }

            console.log("Deploying StreamDataSpotter for sourceID", sourceID);
            // Deploy spotter
            let tx = await factory.deployNewStreamDataSpotter(
                encodedProtocolID,
                encodedSourceID,
                await processingLib.getAddress(),
                spotterConsensusRate,
                minFinalizationInterval,
                encodedAllowedKeys,
                onlyAllowedKeys
            );
            await tx.wait();
            console.log(`Deployed spotter for sourceID ${sourceID} at ${tx.hash}`);

            // Ensure spotter is created
            spotterAddress = await factory.getSpotter(
                encodedProtocolID,
                encodedSourceID
            );
            expect(spotterAddress).to.not.eq(ethers.ZeroAddress);

            // Push to deploy info and save to disk
            this.dump!.spotters!.push({
                sourceID: sourceID,
                processingLib: await processingLib.getAddress(),
                spotter: spotterAddress,
            });
            await this.dumpDeployInfo();
        }
    }

    private async dumpDeployInfo() {
        const p = getDeploymentDumpPath(this.oracleKey);
        fs.writeFileSync(p, JSON.stringify(this.dump, null, 2));
        console.log(`Dumped deploy info to ${p}`);
    }

    private dumpDestinationContracts() {
        dumpDestinationContracts(this.oracleKey, this.destinationContracts)
        console.log(`Dumped destination contracts`);
    }

    async load() {
        await this.loadPhotonContracts();
        await this.loadDestinationContracts();
        await this.tryLoadDump();
    }

    private async loadDestinationContracts() {
        console.log("Loading Destination Contracts");
        try {
            this.destinationContracts = loadDestinationContracts(this.oracleKey);
        } catch (e: any) {
            console.log("Catched error during loading destination contracts, initialiazing empty. error: ", e.message);
            this.destinationContracts = {};
        }
        console.log(this.destinationContracts);
        console.log(`Loaded Destination Contracts`);
    }

    private async tryLoadDump() {
        const p = getDeploymentDumpPath(this.oracleKey);
        try {
            const dump = JSON.parse(fs.readFileSync(p, "utf8"));
            assert.equal(dump.protocolID, this.config.protocolID, "Protocol IDs do not match");
            this.dump = dump;
            console.log(`Loaded dump from ${p}`);
        } catch {
            console.log(`No dump found at ${p}, starting with new`);
        }
    }

    private async loadPhotonContracts() {
        // Get stream data spotter contracts from `@entangle_protocol/oracle-sdk`
        this.photonContracts = loadPhotonAddresses();
    }
}
