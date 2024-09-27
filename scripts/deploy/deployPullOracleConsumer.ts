import hre, { ethers, upgrades } from "hardhat";
import "../deploy/dump/datafeeds_target_addresses.json"
import * as fs from 'fs';
import path from "path";
type DynamicConfig = {
    [key: string]: {
        PullOracleConsumer: string;
    };
  };

function getDeploymentDumpPath(): string {
    return path.join(__dirname, `./dump/pullOracleConsumer_addresses.json`);
}

async function main() {
    const p = getDeploymentDumpPath();
    let pullOracleAddr = '';
    if (hre.network.config.chainId === 11155111) {
        pullOracleAddr = '0x0b2d8Ef1D9104c4Df5C89F00B645Ce8bAa56DeB5'
    } else {
        pullOracleAddr = '0x751c47110351806e41ccDA4C181a50edfA6b63E0'

    }
    const pullOracleConsumerConfig: DynamicConfig = JSON.parse(fs.readFileSync(p, "utf8"));
    const factory = await ethers.getContractFactory('PullOracleConsumer');
    const contract = await upgrades.deployProxy(
        factory,
        [pullOracleAddr], 
        {
            kind: 'uups'
        }
    )
    // let contract = await factory.deploy(pullOracleAddr);
    await contract.waitForDeployment();
    // contract.
    let addr = await contract.getAddress()
    console.log(`PullOracleConsumer deployed to: ${addr}`);

    pullOracleConsumerConfig[hre.network.name].PullOracleConsumer = addr;
    fs.writeFileSync(p, JSON.stringify(pullOracleConsumerConfig, null, 2));
    
}

main().catch(error => {
    console.error(error);
    // throw error;
    process.exitCode = 1;
});
