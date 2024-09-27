import hre, { ethers } from "hardhat";
import fs from "fs";
import inquirer from "inquirer";
import {
    PriceStreamDataDeployment,
    PriceStreamConfig,
    PriceStreamChainData,
    deployDestinationImpl,
    DESTINATION_ADDRESSES_PATH
} from "../deploy/deployPriceStreamData";
import { loadPhotonAddresses } from "../deploy/config";
import {
    allNetworks,
    setupNetwork,
    isOracleNetwork,
    allOracleNetworks,
    askToProceed,
} from "../deploy/utils";

export async function deployPriceStreamData() {
    let [admin,] = await hre.ethers.getSigners();
    const registerOnMas = "Register PriceStreamData protocol on MAS";
    const registerTargetChains = "Register on target chains";
    const registerTargetChainSolana = "Register on solana target chain";
    const registerFinalizers = "Register finalizers on EOB";
    const depositToProtocol = "Deposit NGL to protocol balance";
    const registerProtocolSpotters = "Register declared StreamDataSpotters";
    const deployPullOracles = "Deploy PullOracle contracts on dest chains";
    const upgradePullOracles = "Upgrade PullOracle contracts on dest chains";
    const upgradeProcessingLib = "Upgrade ProcessingLib on all declared spotters in the config";
    const upgradeAllowedKeys = "Upgrade allowedKeys in StreamData protocol";

    const { action } = await inquirer.prompt([
        {
            type: "list",
            name: "action",
            message: "Choose deploy action",
            choices: [
                registerOnMas,
                registerTargetChains,
                registerTargetChainSolana,
                registerProtocolSpotters,
                registerFinalizers,
                depositToProtocol,
                deployPullOracles,
                upgradePullOracles,
                upgradeProcessingLib,
                upgradeAllowedKeys,
                "log"
            ],
        },
    ]);

    const { oracleChainKey } = await inquirer.prompt([
        {
            type: "list",
            name: "oracleChainKey",
            message: "Choose oracle chain",
            choices: allOracleNetworks(),
        },
    ]);

    console.log("Configured Params: ");
    console.log("Spotter addresses: ");
    const photonAddresses = loadPhotonAddresses();
    for (const [name, address] of Object.entries(photonAddresses[oracleChainKey as keyof typeof photonAddresses])) {
        console.log(`* ${name}: ${address}`);
    }

    const deployment = new PriceStreamDataDeployment(admin, oracleChainKey);
    await deployment.load();
    console.log(`Configured Price Stream Data Deployment`);

    await askToProceed();

    if (action === deployPullOracles) {
        let networks = await allNetworks();
        networks = networks.filter((net: any) => !isOracleNetwork(net));
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
        console.log("Deploying PullOracles on ", scope);

        // Deploy PullOracle contract for each selected network
        for (const net of scope) {
            await setupNetwork(net);
            let [admin,] = await hre.ethers.getSigners();
            console.log("admin", admin.address);
            console.log(`Network setup done. Deploying PullOracle on ${net}`);
            await deployment.deployPullOracle(admin);
        }
        console.log(`Deployed PullOracles`);
    } else if (action === upgradePullOracles) {
        let networks = await allNetworks();
        networks = networks.filter((net: any) => !isOracleNetwork(net));

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
        console.log("Upgrading PullOracles on ", scope);

        // Upgrade PullOracle contract on each selected network
        for (const net of scope) {
            await setupNetwork(net);
            let [admin,] = await hre.ethers.getSigners();
            console.log("admin", admin.address);
            console.log(`Network setup done. Upgrading PullOracle on ${net}`);
            await deployment.upgradePullOracle();
        }
        console.log(`Deployed PullOracles`);
    } else if (action === registerOnMas) {
        await setupNetwork(oracleChainKey)
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);

        await deployment.registerOnMAS(admin);
        console.log(`Registered on MAS`);
    } else if (action === registerProtocolSpotters) {
        await setupNetwork(oracleChainKey)
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);

        await deployment.registerProtocolSpotters(admin);
        console.log(`Deployed protocol spotters`);
    } else if (action === upgradeProcessingLib) {
        await setupNetwork(oracleChainKey)
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);

        await deployment.upgradeProtocolSpotters(admin);
        console.log(`Upgrade done`);
    } else if (action === depositToProtocol) {
        await setupNetwork(oracleChainKey)
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);

        const { depositAmount } = await inquirer.prompt([
            {
                type: "input",
                name: "depositAmount",
                message: "Deposit NGL amount",
            },
        ]);
        const depositAmountScaled = ethers.parseUnits(depositAmount, 18);
        await deployment.depositToProtocol(admin, depositAmountScaled);
    } else if (action === registerTargetChains) {

        let networks = await allNetworks();
        networks = networks.filter((net: any) => !isOracleNetwork(net));

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

        // Collect chain ids from the selected networks
        let chainIDs = [];
        for (const net of scope) {
            await setupNetwork(net);
            const network = await ethers.provider.getNetwork();
            chainIDs.push(network.chainId);
        }

        await setupNetwork(oracleChainKey);
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);
        await deployment.registerTargetChains(admin, chainIDs);
    } else if (action == registerTargetChainSolana) {
        await setupNetwork(oracleChainKey);
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);
        await deployment.registerTargetChainSolana(admin);
    } else if (action === registerFinalizers) {
        await setupNetwork(oracleChainKey)
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);
        await deployment.registerFinalizers(admin);
    } else if (action === upgradeAllowedKeys) {
        await setupNetwork(oracleChainKey);
        let [admin,] = await hre.ethers.getSigners();
        console.log("admin", admin.address);
        await deployment.upgradeAllowedKeys(admin);

    } else if (action === "log") {
        console.log("Config: ");
        console.log(deployment.config);
    }

    console.log(`deployPriceStreamData done`);
}
