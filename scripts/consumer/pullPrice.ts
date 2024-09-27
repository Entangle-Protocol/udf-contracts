import hre, { ethers } from "hardhat";
import "../deploy/dump/datafeeds_target_addresses.json"
import * as fs from 'fs';
import path from "path";
import { ApiResponse, Signature, decodeBase64ToBytes32, getPriceForAsset } from "./util";
import { BigNumberish, BytesLike } from "ethers";
type DynamicConfig = {
    [key: string]: {
        PullOracleConsumer: string;
    };
  };

function getDeploymentDumpPath(): string {
    return path.join(__dirname, `../deploy/dump/pullOracleConsumer_addresses.json`);
}

interface SignatureStruct {
    r: BytesLike;
    s: BytesLike;
    v: number;
  }
  
  type ContractMethodArgs = [
    merkleRoot: BytesLike,
    merkleProof: BytesLike[],
    signatures: SignatureStruct[],
    dataKey: BytesLike,
    price: string,
    timestamp: string
  ];

  function prepareDataForContract(data: ApiResponse): ContractMethodArgs {
    const feed = data.calldata.feeds[0]; // Предполагаем, что нам нужен первый фид
    
    const signatures: SignatureStruct[] = data.calldata.signatures.map(sig => ({
      r: sig.R,
      s: sig.S,
      v: sig.V
    }));

    const decodedMerkleProofs = feed.merkleProofs.map(decodeBase64ToBytes32);
  
    return [
      data.calldata.merkleRoot,
      decodedMerkleProofs,
      signatures,
      ethers.encodeBytes32String(feed.key),
      feed.value.data,
      feed.value.timestamp.toString()
    ];
  }

async function main() {
    const p = getDeploymentDumpPath();
    const pullOracleConsumerConfig: DynamicConfig = JSON.parse(fs.readFileSync(p, "utf8"));

    let consumer = await ethers.getContractAt("PullOracleConsumer", pullOracleConsumerConfig[hre.network.name].PullOracleConsumer);
    let dataForCall: ApiResponse | null = await getPriceForAsset('NGL/USD');
    if (!dataForCall) {
        console.log('api response returned null, aborting');
        return;
    }
    let contractData = prepareDataForContract(dataForCall);
    let tx = await consumer.getLastPrice(
        contractData[0],
        contractData[1],
        contractData[2],
        contractData[3],
        contractData[4],
        contractData[5]
    );
    await tx.wait();
    console.log(tx);


    let priceFromContract = await consumer.lastPrice(contractData[3]);

    console.log(`latest price from contract: ${priceFromContract}`);
    
}

main().catch(error => {
    console.error(error);
    // throw error;
    process.exitCode = 1;
});
