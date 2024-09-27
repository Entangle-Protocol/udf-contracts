import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { PullOracle } from "../typechain-types";
import { ethers, upgrades } from "hardhat";
import { BytesLike } from "ethers";
import _ from "lodash";
import { EndPointArtifact } from "@entangle_protocol/oracle-sdk/dist/src";
import {
    EndPoint,
    EndPoint__factory,
} from "@entangle_protocol/oracle-sdk/dist/typechain-types";

function deriveProtocolId(i: number) {
    return ethers.AbiCoder.defaultAbiCoder().encode(["uint"], [i + 1]);
}

function padBigint(value: bigint, length: number): BytesLike {
    const paddedHex = ethers.zeroPadValue(ethers.toBeArray(value), length)
    return paddedHex
}

/**
* Update ABI specification for EVM PullOracle
* Format: <merkle_root><sigs_length><sigs_array><updates_length><updates_array>
*
* Structure:
* - `merkle_root` (32 bytes): The Merkle root hash.
* - `sigs_length` (1 byte): Number of signatures.
* - `sigs_array` (variable length): Array of signatures, each 65 bytes (RSV format).
*   - Each signature is composed of:
*     - `r` (32 bytes): R component of the signature.
*     - `s` (32 bytes): S component of the signature.
*     - `v` (1 byte): V component of the signature.
* - `updates_length` (1 byte): Number of updates.
* - `updates_array` (variable length): Array of updates, each following the Update ABI format.
*
* Update ABI Format: <merkle_proof_length><merkle_proof_array><timestamp><price><dataKey>
*
* Update Structure:
* - `merkle_proof_length` (1 byte): Length of the Merkle proof array.
* - `merkle_proof_array` (variable length): Array of Merkle proofs, each 32 bytes.
*   - `merkle_proof` (array of bytes32): Merkle proof elements.
*     - Each element is 32 bytes.
* - `timestamp` (32 bytes): Update timestamp (uint256).
* - `price` (32 bytes): Asset price (uint256).
* - `dataKey` (32 bytes): Asset data key (bytes32).
*
* Size Calculations:
* - `sigs_array` size: `sigs_length * 65` bytes.
* - `merkle_proof_array` size: `merkle_proof_length * 32` bytes.
* - `update` size: `(1 + merkle_proof_length * 32 + 32 + 32 + 32)` bytes.
* - Total updates size: `(1 + merkle_proof_length * 32 + 96) * updates_length` bytes.
*/
function encodePullMultipleUpdate(
    merkleRoot: BytesLike,
    signatures: { v: 27 | 28, r: string, s: string }[],
    merkleProofs: string[][],
    updateData: { dataKey: string, price: bigint, timestamp: bigint }[]
): BytesLike {
    expect(merkleProofs.length).to.equal(updateData.length);

    // Encode signatures
    let encodedSignatures: Uint8Array[] = [];
    for (const { v, r, s } of signatures) {
        encodedSignatures.push(ethers.getBytes(r));
        encodedSignatures.push(ethers.getBytes(s));
        encodedSignatures.push(ethers.toBeArray(v));
    }

    // Encode update data
    let updateDataArray: Uint8Array[] = [];
    for (let i = 0; i < updateData.length; ++i) {
        const { dataKey, price, timestamp } = updateData[i];
        const merkleProof = merkleProofs[i];

        const proofsLength = merkleProof.length;
        if (merkleProof.length == 0) {
            updateDataArray.push(new Uint8Array([ 0 ]));
        } else {
            updateDataArray.push(ethers.toBeArray(proofsLength));
            for (const proof of merkleProof) {
                updateDataArray.push(ethers.getBytes(proof));
            }
        }

        updateDataArray.push(ethers.getBytes(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [timestamp])));
        updateDataArray.push(ethers.getBytes(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [price])));
        updateDataArray.push(ethers.getBytes(ethers.encodeBytes32String(dataKey)));
    }

    // Append all the update data together
    const bodyBytesArray: Uint8Array[] = [
        ethers.getBytes(merkleRoot),
        ethers.toBeArray(signatures.length),
        ...encodedSignatures,
        ethers.toBeArray(updateData.length),
        ...updateDataArray
    ];
    const bodyBytes = Buffer.concat(bodyBytesArray);
    const body = Buffer.from(bodyBytes);

    return ethers.getBytes(body);
}

async function signMessage(signer: HardhatEthersSigner, msg: any) {
    const msgString = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [msg]);
    const msgBytes = ethers.getBytes(msgString);
    const sign = ethers.Signature.from(await signer.signMessage(msgBytes));
    const v = sign.v;
    const r = sign.r;
    const s = sign.s;
    expect(signer.address).eq(ethers.verifyMessage(msgBytes, sign));
    return { v, r, s };
}

interface Initializable {
    interface: {
        initialize: (...args: any[]) => any;
    };

}

type Args<T extends Initializable> = Parameters<T["interface"]["initialize"]>;

async function deploy_upgradable<T extends Initializable>(name: string, args: Args<T>) {
    const factory = await ethers.getContractFactory(name);

    const inst = await upgrades.deployProxy(factory, args, { kind: "uups" });
    await inst.waitForDeployment();

    return inst as unknown as T;
}

describe("PullOracle", () => {
    let admin: HardhatEthersSigner;
    // const protocolId = deriveProtocolId(1);
    const protocolId = ethers.encodeBytes32String("universal-data-feeds");
    const dataKey = ethers.encodeBytes32String("NGL/USD");
    const N_TRANSMITTERS = 3;
    const CONSENSUS_RATE = 7500;
    let signers: HardhatEthersSigner[];
    let govSigner: HardhatEthersSigner;
    let transmitters: HardhatEthersSigner[];

    before(async () => {
        signers = await ethers.getSigners();
        let i = 0;
        admin = signers[i++];
        govSigner = signers[i++];
        transmitters = signers.slice(i, i + N_TRANSMITTERS);
        i += N_TRANSMITTERS;

        console.log("Test params:");
        console.log("* Admin:", admin.address);
        for (const transmitter of transmitters) {
            console.log("* Transmitter:", transmitter.address);
        }
    });

    async function deployPullOracleFixture() {
        const eobChainId = await ethers.provider.send("eth_chainId", []);
        const endPointFactory = await ethers.getContractFactory("EndPoint");
        const endPoint: EndPoint = (await upgrades.deployProxy(
            endPointFactory,
            [[admin.address], eobChainId],
            {
                kind: "uups",
            }
        )) as unknown as EndPoint;
        console.log(`Deployed EndPoint at ${await endPoint.getAddress()}`);

        const pullOracleFactory = await ethers.getContractFactory("PullOracle");
        const pullOracle: PullOracle = (await upgrades.deployProxy(
            pullOracleFactory,
            [protocolId, await endPoint.getAddress()],
            {
                kind: "uups",
            }
        )) as unknown as PullOracle;
        console.log(`Deployed PullOracle at ${await pullOracle.getAddress()}`);

        // Add gov protocol to be able to mock it later
        let tx = await endPoint.connect(admin).addGov(
            govSigner.address,
            0,
            [],
            [],
            ethers.ZeroAddress,
            ethers.ZeroAddress
        );
        await tx.wait();

        // Add allowed protocol
        tx = await endPoint.connect(govSigner).addAllowedProtocol(
            protocolId,
            CONSENSUS_RATE,
            transmitters.map(t => t.address)
        );
        await tx.wait();

        return {
            pullOracle,
            endPoint
        }
    }

    describe("Test PullOracle with single asset merkle tree", () => {
        let pullOracle: PullOracle;
        let endPoint: EndPoint;

        it("Deploy PullOracle fixture", async () => {
            let contracts  = await loadFixture(deployPullOracleFixture);
            pullOracle = contracts.pullOracle!;
            expect(await pullOracle.getAddress()).to.be.properAddress;
            endPoint = contracts.endPoint!;
            expect(await endPoint.getAddress()).to.be.properAddress;

            expect(await pullOracle.protocolId()).to.equal(protocolId);
            expect(await pullOracle.endPoint()).to.equal(await endPoint.getAddress());
        });

        // Test PullOracle.getLastPrice

        {
            const merkleTreeData = [
                {
                    timestamp: BigInt("1712156081"),
                    price: ethers.parseUnits("0.7", 18),
                    dataKey: "NGL/USD"
                },
            ];

            let merkleTreeValues = merkleTreeData.map(({ timestamp, price, dataKey }) => {
                return [
                    timestamp,
                    padBigint(price, 32),
                    ethers.encodeBytes32String(dataKey)
                ];
            });

            const tree = StandardMerkleTree.of(merkleTreeValues, ["uint256", "bytes", "bytes32"], { sortLeaves: false });
            const root = tree.root;

            // Get the first element from the tree & proof for that element
            let proof = tree.getProof(0);
            let updateDataKey = ethers.encodeBytes32String(merkleTreeData[0].dataKey);
            let updatePrice = merkleTreeData[0].price;
            let updateTimestamp = merkleTreeData[0].timestamp;

            it("Test PullOracle.getLastPrice", async () => {
                // Sign the root with all transmitters
                let signatures = []
                for (const transmitter of transmitters) {
                    const signature = await signMessage(transmitter, root);
                    signatures.push(signature);
                }

                let tx = await pullOracle
                    .connect(admin)
                    .getLastPrice(root, proof, signatures, updateDataKey, updatePrice, updateTimestamp);
                let rec = await tx.wait();
                console.log("PullOracle.getLastPrice tx", tx.hash);
                console.log("gasUsed", rec!.gasUsed);

                // Verify the update data in PullOracle
                const { latestPrice, latestTimestamp } = await pullOracle.latestUpdate(updateDataKey);
                expect(latestPrice).to.equal(updatePrice);
                expect(latestTimestamp).to.equal(updateTimestamp);
            });

            it("Test PullOracle.getLastPrice with invalid signer (PullOracle__InsufficientSignatures)", async () => {
                // Sign the root with all transmitters
                let signatures = []
                for (const transmitter of transmitters) {
                    const signature = await signMessage(transmitter, root);
                    signatures.push(signature);
                }
                // Invalidate second signature
                signatures[1].r = "0x" + "2".repeat(64);

                const rootMsg = ethers.keccak256(ethers.concat([
                    ethers.toUtf8Bytes(ethers.MessagePrefix+"32"),
                    root,
                ]));
                const recoveredSigner = ethers.recoverAddress(rootMsg, signatures[1]);

                let tx = pullOracle
                .connect(admin)
                .getLastPrice(root, proof, signatures, updateDataKey, updatePrice, updateTimestamp);
                await expect(tx).to.be
                .revertedWithCustomError(pullOracle, "PullOracle__InsufficientSignatures")
                .withArgs(transmitters.length-1, transmitters.length);
            });

            it("Test PullOracle.getLastPrice with too few signatures (PullOracle__InsufficientSignatures)", async () => {
                let signatures = []
                for (const transmitter of transmitters.slice(1)) {
                    const signature = await signMessage(transmitter, root);
                    signatures.push(signature);
                }

                let tx = pullOracle
                .connect(admin)
                .getLastPrice(root, proof, signatures, updateDataKey, updatePrice, updateTimestamp);
                await expect(tx).to.be
                .revertedWithCustomError(pullOracle, "PullOracle__InsufficientSignatures")
                .withArgs(2, 3);
            });
        }

        // Test PullOracle.updateMultipleAssets

        {
            const merkleTreeData = [
                {
                    timestamp: BigInt("1712156581"),
                    price: ethers.parseUnits("0.75", 18),
                    dataKey: "NGL/USD"
                },
            ];

            let merkleTreeValues = merkleTreeData.map(({ timestamp, price, dataKey }) => {
                return [
                    timestamp,
                    padBigint(price, 32),
                    ethers.encodeBytes32String(dataKey)
                ];
            });

            const tree = StandardMerkleTree.of(merkleTreeValues, ["uint256", "bytes", "bytes32"], { sortLeaves: false });
            const root = tree.root;
            console.log("root", root);

            // Get the first element from the tree & proof for that element
            let updateDataKey = ethers.encodeBytes32String(merkleTreeData[0].dataKey);
            let updatePrice = merkleTreeData[0].price;
            let updateTimestamp = merkleTreeData[0].timestamp;

            it("Test PullOracle.updateMultipleAssets with single asset", async () => {
                // Sign the root with all transmitters
                let rootSignatures: { v: 27 | 28, r: string, s: string }[] = [];
                for (const transmitter of transmitters) {
                    const signature = await signMessage(transmitter, root);
                    rootSignatures.push(signature);
                }
                let merkleProofs = merkleTreeData.map((_, i) => tree.getProof(i));
                const update = encodePullMultipleUpdate(
                    root,
                    rootSignatures,
                    merkleProofs,
                    merkleTreeData
                );
                let tx = await pullOracle
                    .connect(admin)
                    .updateMultipleAssets(update);
                let rec = await tx.wait();
                console.log("PullOracle.updateMultipleAssets tx", tx.hash);
                console.log("gasUsed", rec!.gasUsed);

                // Verify the update data in PullOracle
                const { latestPrice, latestTimestamp } = await pullOracle.latestUpdate(updateDataKey);
                expect(latestPrice).to.equal(updatePrice);
                expect(latestTimestamp).to.equal(updateTimestamp);
            });

        }
    });

    describe("Test PullOracle with 4 asset merkle tree", () => {
        let pullOracle: PullOracle;
        let endPoint: EndPoint;

        it("Deploy PullOracle fixture", async () => {
            let contracts  = await loadFixture(deployPullOracleFixture);
            pullOracle = contracts.pullOracle!;
            expect(await pullOracle.getAddress()).to.be.properAddress;
            endPoint = contracts.endPoint!;
            expect(await endPoint.getAddress()).to.be.properAddress;

            expect(await pullOracle.protocolId()).to.equal(protocolId);
            expect(await pullOracle.endPoint()).to.equal(await endPoint.getAddress());
        });

        {
            const merkleTreeData = [
                {
                    timestamp: BigInt("1712156081"),
                    price: ethers.parseUnits("0.99", 18),
                    dataKey: "USDC/USD"
                },
                {
                    timestamp: BigInt("1712156081"),
                    price: ethers.parseUnits("3100", 18),
                    dataKey: "ETH/USD"
                },
                {
                    timestamp: BigInt("1712156081"),
                    price: ethers.parseUnits("68000", 18),
                    dataKey: "BTC/USD"
                },
                {
                    timestamp: BigInt("1712156081"),
                    price: ethers.parseUnits("0.7", 18),
                    dataKey: "NGL/USD"
                },
            ];

            // Convert the merkle tree data to the format expected by the merkle tree
            let merkleTreeValues = merkleTreeData.map(({ timestamp, price, dataKey }) => {
                return [
                    timestamp,
                    padBigint(price, 32),
                    ethers.encodeBytes32String(dataKey)
                ];
            });

            const tree = StandardMerkleTree.of(merkleTreeValues, ["uint256", "bytes", "bytes32"], { sortLeaves: false });
            const root = tree.root;
            let rootSignatures: { v: 27 | 28, r: string, s: string }[] = [];

            // For each leaf node in the merkle tree, calculate and verify other proofs
            //

            it("Test PullOracle.getLastPrice", async () => {
                console.log("Computed root hash", root);

                // Sign the root with all transmitters
                for (const transmitter of transmitters) {
                    const signature = await signMessage(transmitter, root);
                    rootSignatures.push(signature);
                }

                for (let i = 0; i < merkleTreeData.length; ++i) {
                    let updateDataKey = ethers.encodeBytes32String(merkleTreeData[i].dataKey);
                    let proof = tree.getProof(i);
                    let updatePrice = merkleTreeData[i].price;
                    let updateTimestamp = merkleTreeData[i].timestamp;

                    let tx = await pullOracle
                        .connect(admin)
                        .getLastPrice(root, proof, rootSignatures, updateDataKey, updatePrice, updateTimestamp);
                    let rec = await tx.wait();
                    console.log("PullOracle.getLastPrice tx", tx.hash);
                    console.log("gasUsed", rec!.gasUsed);

                    // Verify the update data in PullOracle
                    const { latestPrice, latestTimestamp } = await pullOracle.latestUpdate(updateDataKey);
                    expect(latestPrice).to.equal(updatePrice);
                    expect(latestTimestamp).to.equal(updateTimestamp);
                }
            });

            it("Check updates for every asset in merkle tree", async () => {
                for (let i = 0; i < merkleTreeData.length; ++i) {
                    let { price, timestamp, dataKey } = merkleTreeData[i];
                    let updateDataKey = ethers.encodeBytes32String(dataKey);
                    let { latestPrice, latestTimestamp } = await pullOracle.latestUpdate(updateDataKey);
                    expect(latestPrice).to.equal(price);
                    expect(latestTimestamp).to.equal(timestamp);
                }
            });
        }

        {
            const merkleTreeData = [
                {
                    timestamp: BigInt("1712156481"),
                    price: ethers.parseUnits("1.01", 18),
                    dataKey: "USDC/USD"
                },
                {
                    timestamp: BigInt("1712156481"),
                    price: ethers.parseUnits("3230", 18),
                    dataKey: "ETH/USD"
                },
                {
                    timestamp: BigInt("1712156481"),
                    price: ethers.parseUnits("69510", 18),
                    dataKey: "BTC/USD"
                },
                {
                    timestamp: BigInt("1712156481"),
                    price: ethers.parseUnits("0.83", 18),
                    dataKey: "NGL/USD"
                },
            ];

            // Convert the merkle tree data to the format expected by the merkle tree
            let merkleTreeValues = merkleTreeData.map(({ timestamp, price, dataKey }) => {
                return [
                    timestamp,
                    padBigint(price, 32),
                    ethers.encodeBytes32String(dataKey)
                ];
            });

            const tree = StandardMerkleTree.of(merkleTreeValues, ["uint256", "bytes", "bytes32"], { sortLeaves: false });
            const root = tree.root;
            let rootSignatures: { v: 27 | 28, r: string, s: string }[] = [];


            it("Test PullOralce.updateMultipleAssets", async () => {
                // Sign the root with all transmitters
                for (const transmitter of transmitters) {
                    const signature = await signMessage(transmitter, root);
                    rootSignatures.push(signature);
                }

                let merkleProofs = merkleTreeData.map((_, i) => tree.getProof(i));
                const update = encodePullMultipleUpdate(
                    root,
                    rootSignatures,
                    merkleProofs,
                    merkleTreeData
                );

                let tx = await pullOracle
                    .connect(admin)
                    .updateMultipleAssets(update);
                let rec = await tx.wait();
                console.log("PullOracle.updateMultipleAssets tx", tx.hash);
                console.log("gasUsed", rec!.gasUsed);

                // expect(false).to.be.true;
            });

            it("Check updates for every asset in merkle tree", async () => {
                for (let i = 0; i < merkleTreeData.length; ++i) {
                    let { price, timestamp, dataKey } = merkleTreeData[i];
                    let updateDataKey = ethers.encodeBytes32String(dataKey);
                    let { latestPrice, latestTimestamp } = await pullOracle.latestUpdate(updateDataKey);
                    expect(latestPrice).to.equal(price);
                    expect(latestTimestamp).to.equal(timestamp);
                }
            });
        }
    });
});
