import hre, { ethers, upgrades } from "hardhat";
import {
    PriceStreamConfig,
    bindStreamDataSpotterFactory,
    loadPhotonAddresses,
    bindMasterStreamDataSpotter,
    bindStreamDataSpotter,
    bindExternalDeveloperHub,
    bindGlobalConfig,
    bindPullOracle,
    MERKLE_SIGS_SOURCE_ID
} from "../deploy/config";
import { formatTimestampPast } from "./utils";
import {
    OracleNetworkKey
} from "../deploy/utils";
import { Table } from "console-table-printer";

export interface PrintSpotterConfig {
    sourceID: string;
    allowedKeys: string[];
}

export async function printProtocolInfo(oracleKey: OracleNetworkKey, protocolID: string) {
    const photonAddresses = loadPhotonAddresses()
    // EDH -> ExternalDeveloperHub
    const edhAddress = photonAddresses[oracleKey].ExternalDeveloperHub;
    const edh = await bindExternalDeveloperHub(edhAddress);

    // Print protocolInfo for protocolID

    function printParamsTable(title: string, params: {param: string, value: any}[]) {
	const printTable = new Table({
	    title: title,
	    columns: [
		{ name: "param", color: 'green' },
		{ name: "value", color: 'green' },
	    ],
	    rowSeparator: true,
	});

	for (const param of params) {
	    printTable.addRow(param);
	}
	printTable.printTable();
    }

    const encodedProtocolID = ethers.encodeBytes32String(protocolID);
    const [owner, fee, balance, maxTransmitters, minDelegateAmount, minPersonalAmount, active] = await edh.protocolInfo(encodedProtocolID);

    printParamsTable(
	`Protocol Info for ${protocolID}`,
	[
	    { param: "owner", value: owner },
	    { param: "fee", value: fee },
	    { param: "balance", value: balance },
	    { param: "maxTransmitters", value: maxTransmitters },
	    { param: "minDelegateAmount", value: minDelegateAmount },
	    { param: "minPersonalAmount", value: minPersonalAmount },
	    { param: "active", value: active },
	]
    );

    // Print active params for protocolID
    const [
	msgBetAmount, dataBetAmount, msgBetReward, msgBetFirstReward,
	dataBetReward, dataBetFirstReward, consensusTargetRate
    ] = await edh.activeParams(encodedProtocolID);
    // Print other important info
    const edhMinProtocolBalance = await edh.minProtocolBalance(encodedProtocolID);
    console.log("minProtocolBalance", edhMinProtocolBalance);

    printParamsTable(
	`Active Params for ${protocolID}`,
	[
	    { param: "msgBetAmount", value: msgBetAmount },
	    { param: "dataBetAmount", value: dataBetAmount },
	    { param: "msgBetReward", value: msgBetReward },
	    { param: "msgBetFirstReward", value: msgBetFirstReward },
	    { param: "dataBetReward", value: dataBetReward },
	    { param: "dataBetFirstReward", value: dataBetFirstReward },
	    { param: "consensusTargetRate", value: consensusTargetRate },
	    { param: "minProtocolBalance", value: edhMinProtocolBalance },
	]
    );

    // Print GlobalConfig params
    const globalConfigAddress = photonAddresses[oracleKey].GlobalConfig;
    const globalConfig = await bindGlobalConfig(globalConfigAddress);

    const feeCollector = await globalConfig.feeCollector();
    const protocolRegisterFee = await globalConfig.protocolRegisterFee();
    const manualTransmitterFee = await globalConfig.manualTransmitterFee();
    const changeProtocolParamsFee = await globalConfig.changeProtocolParamsFee();
    const minProtocolBalance = await globalConfig.minProtocolBalance();
    const maxTransmittersCount = await globalConfig.maxTransmittersCount();
    const agentRewardFee = await globalConfig.agentRewardFee();
    const agentStakePerTransmitter = await globalConfig.agentStakePerTransmitter();
    const slashingBorder = await globalConfig.slashingBorder();
    const protocolOperationFee = await globalConfig.protocolOperationFee();
    const initNewChainFee = await globalConfig.initNewChainFee();
    const betTimeout = await globalConfig.betTimeout();
    const minRoundTime = await globalConfig.minRoundTime();

    printParamsTable(
	`GlobalConfig (${globalConfigAddress}) Params`,
	[
	    { param: "feeCollector", value: feeCollector },
	    { param: "protocolRegisterFee", value: protocolRegisterFee },
	    { param: "manualTransmitterFee", value: manualTransmitterFee },
	    { param: "changeProtocolParamsFee", value: changeProtocolParamsFee },
	    { param: "minProtocolBalance", value: minProtocolBalance },
	    { param: "maxTransmittersCount", value: maxTransmittersCount },
	    { param: "agentRewardFee", value: agentRewardFee },
	    { param: "agentStakePerTransmitter", value: agentStakePerTransmitter },
	    { param: "slashingBorder", value: slashingBorder },
	    { param: "protocolOperationFee", value: protocolOperationFee },
	    { param: "initNewChainFee", value: initNewChainFee },
	    { param: "betTimeout", value: betTimeout },
	    { param: "minRoundTime", value: minRoundTime },
	],
    );
}

export async function printAssetInfo(
    oracleKey: OracleNetworkKey,
    protocolID: string,
    spotters: PrintSpotterConfig[],
    formatPrice?: (sourceID: string, price: string) => string
) {
    const photonAddresses = loadPhotonAddresses()
    const factoryAddress = photonAddresses[oracleKey].StreamDataSpotterFactory;
    const masterAddress = photonAddresses[oracleKey].MasterStreamDataSpotter;
    const factroy = await bindStreamDataSpotterFactory(factoryAddress);
    const master = await bindMasterStreamDataSpotter(masterAddress);
    const encodedProtocolID = ethers.encodeBytes32String(protocolID);

    for (const spotterConf of spotters) {
	const sourceID = spotterConf.sourceID;
	// Skip merkle sigs
	if (sourceID === MERKLE_SIGS_SOURCE_ID) {
	    continue;
	}

	const allowedKeys = spotterConf.allowedKeys;
	const encodedSourceID = ethers.encodeBytes32String(sourceID);

	const spotterAddress = await factroy.getSpotter(encodedProtocolID, encodedSourceID);
	const spotter = await bindStreamDataSpotter(spotterAddress);

	const merkleRoot = await master.spotterData(encodedProtocolID, encodedSourceID);

	// Build printing table
	let spotterTable = new Table({
	    title: `Spotter ${sourceID} for ${protocolID}, MerkleRoot: ${merkleRoot}`,
	    columns: [
		{ name: "asset", color: 'white', alignment: 'center' },
		{ name: "acceptedValue", color: 'green', alignment: 'left' },
		{ name: "updateTimestamp", color: 'green', alignment: 'left' },
		{ name: "nVotes", color: 'green', alignment: 'left' },
		{ name: "currentRoundOpHash", color: 'green', alignment: 'left' },
	    ],
	    rowSeparator: true,
	});

	for (const key of allowedKeys) {
	    const encodedKey = ethers.encodeBytes32String(key);
	    let {
		acceptedValue,
		currentRoundOpHash,
		updateTimestamp,
		nVotes
	    }= await spotter.assetInfo(encodedKey);

	    const timePassed = BigInt(Math.floor((Date.now() / 1000)) - Number(updateTimestamp));

	    let acceptedValueStr: string
	    if (formatPrice) {
		acceptedValueStr = formatPrice(sourceID, acceptedValue);
	    } else {
		acceptedValueStr = acceptedValue;
	    }
	    spotterTable.addRow({
		asset: key,
		acceptedValue: acceptedValueStr,
		currentRoundOpHash: "0x"+currentRoundOpHash.toString(16),
		updateTimestamp: updateTimestamp + " (" + formatTimestampPast(timePassed) + ")",
		nVotes: nVotes,
	    });
	}

	spotterTable.printTable();
    }
}

export async function printVotes(
    oracleKey: OracleNetworkKey,
    protocolID: string,
    spotters: PrintSpotterConfig[],
    transmitters: string[],
    formatPrice?: (sourceID: string, price: string) => string
) {
    const photonAddresses = loadPhotonAddresses();
    const factoryAddress = photonAddresses[oracleKey].StreamDataSpotterFactory;
    const factroy = await bindStreamDataSpotterFactory(factoryAddress);
    const encodedProtocolID = ethers.encodeBytes32String(protocolID);

	let printTables = [];
	for (const transmitter of transmitters) {
	    let printTable = new Table({
		title: `Votes from transmitter ${transmitter}`,
		columns: [
		    { name: "asset", color: 'white', alignment: 'center' },
		    { name: "sourceID", color: 'green', alignment: 'center' },
		    { name: "priceVote", color: 'green', alignment: 'left' },
		    { name: "timestamp", color: 'green', alignment: 'left' },
		    { name: "priceVoteRaw", color: 'green', alignment: 'left' },
		],
		rowSeparator: true,
	    });
	    printTables.push(printTable);
	}

    for (const spotterConf of spotters) {
	const sourceID = spotterConf.sourceID;
	if (sourceID === MERKLE_SIGS_SOURCE_ID) {
	    continue;
	}

	const allowedKeys = spotterConf.allowedKeys;
	const encodedSourceID = ethers.encodeBytes32String(sourceID);

	const spotterAddress = await factroy.getSpotter(encodedProtocolID, encodedSourceID);
	// console.log("Spotter found", protocolID, sourceID, spotterAddress);

	const spotter = await bindStreamDataSpotter(spotterAddress);


	for (const key of allowedKeys) {
	    const encodedKey = ethers.encodeBytes32String(key);
	    for (let i = 0; i < transmitters.length; ++i) {
		const transmitter = transmitters[i];
		const [vote, timestamp] = await spotter.votes(encodedKey, transmitter);
		const priceVote = parseInt(vote);
		const timePassed = BigInt(Math.floor((Date.now() / 1000)) - Number(timestamp));
		// console.log(`Transmitter ${transmitter}:`);
		// console.log("* priceVote", priceVote);
		// console.log(`* timestamp ${timestamp} (${formatTimestampPast(timePassed)})`, );
		// console.log("* priceVoteRaw", vote);
		//
		let voteStr: string
		if (formatPrice) {
		    voteStr = formatPrice(sourceID, vote);
		} else {
		    voteStr = vote;
		}

		printTables[i].addRow({
		    asset: key,
		    sourceID: sourceID,
		    priceVote: voteStr,
		    timestamp: timestamp + " (" + formatTimestampPast(timePassed) + ")",
		    priceVoteRaw: vote,
		});
	    }
	}
    }

    for (const printTable of printTables) {
	printTable.printTable();
    }
}

export async function printMerkleVotes(
    oracleKey: OracleNetworkKey,
    protocolID: string,
    transmitters: string[],
    merkleRoot: string
) {
    const photonAddresses = loadPhotonAddresses()
    const factoryAddress = photonAddresses[oracleKey].StreamDataSpotterFactory;
    const factory = await bindStreamDataSpotterFactory(factoryAddress);

    const encodedProtocolID = ethers.encodeBytes32String(protocolID);
    const encodedMerkleSigs = ethers.encodeBytes32String(MERKLE_SIGS_SOURCE_ID);
    const spotterAddress = await factory.getSpotter(encodedProtocolID, encodedMerkleSigs);

    const spotter = await bindStreamDataSpotter(spotterAddress);
    let {
	acceptedValue,
	currentRoundOpHash,
	updateTimestamp,
	nVotes
    }= await spotter.assetInfo(merkleRoot);
    const acceptedValueInt = parseInt(acceptedValue);
    const timeSinceUpdate = BigInt(Math.floor((Date.now() / 1000)) - Number(updateTimestamp));

    console.log("Merkle root signatures data")
    console.log("* acceptedValue:", acceptedValueInt, acceptedValue)
    console.log("* currentRoundOpHash:", "0x"+currentRoundOpHash.toString(16))
    console.log(`* updateTimestamp: ${updateTimestamp} (${formatTimestampPast(timeSinceUpdate)})`)
    console.log("* nVotes:", nVotes)
    console.log("\nTransmitter votes:");
    for (const transmitter of transmitters) {
	const [vote, timestamp] = await spotter.votes(merkleRoot, transmitter);
	const timePassed = BigInt(Math.floor((Date.now() / 1000)) - Number(timestamp));
	console.log(`Transmitter ${transmitter}:`);
	console.log("* vote", vote);
	console.log(`* timestamp ${timestamp} (${formatTimestampPast(timePassed)})`);
    }
}

export async function printPullOracleInfo(
    pullOracleAddress: string,
    dataKeys: string[],
    formatPrice?: (dataKey: string, price: string) => string
) {
    const pullOracle = await bindPullOracle(pullOracleAddress);

    let printTable = new Table({
	title: `Pull Oracle ${pullOracleAddress}`,
	columns: [
	    { name: "dataKey", color: 'white', alignment: 'center' },
	    { name: "latestPrice", color: 'green', alignment: 'left' },
	    { name: "latestTimestamp", color: 'green', alignment: 'left' },
	],
	rowSeparator: true,
    });

    console.log(`Printing pull oracle updates for ${pullOracleAddress} on chain ${hre.network.name}, dataKeys: ${dataKeys}`)
    for (const dataKey of dataKeys) {
	const encodedDataKey = ethers.encodeBytes32String(dataKey);
	const [
	    latestPrice,
	    latestTimestamp,
	]= await pullOracle.latestUpdate(encodedDataKey);

	const timePassed = BigInt(Math.floor((Date.now() / 1000)) - Number(latestTimestamp));

	let latestPriceStr: string
	if (formatPrice) {
	    latestPriceStr = formatPrice(dataKey, latestPrice.toString());
	} else {
	    latestPriceStr = latestPrice.toString();
	}

	printTable.addRow({
	    dataKey: dataKey,
	    latestPrice: latestPriceStr,
	    latestTimestamp: latestTimestamp + " (" + formatTimestampPast(timePassed) + ")",
	});
    }

    printTable.printTable();
}

export async function printNativeBalance(
    address: string,
    network: string,
) {
    const balance = await ethers.provider.getBalance(address);
    const scaledBalance = ethers.formatEther(balance);
    console.log(`Balance on ${network} ${scaledBalance.toString()}`);
}
