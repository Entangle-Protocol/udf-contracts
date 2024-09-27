import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { PriceSpotterProcessingLib } from "../typechain-types";

describe("PriceSpotterProcesingLib", () => {
    let admin: HardhatEthersSigner;
    let signers: HardhatEthersSigner[];
    let transmitters: HardhatEthersSigner[];
    const N_TRANSMITTERS = 3;

    before(async () => {
        signers = await ethers.getSigners();
        let i = 0;
        admin = signers[i++];
        transmitters = signers.slice(i, i + N_TRANSMITTERS);
        i += N_TRANSMITTERS

        console.log(`Admin: ${admin.address}`);
        console.log(`Transmitters: ${transmitters.map(t => t.address).join(", ")}`);
    });

    async function deployPriceProcessingLibFixture() {
        const processingLibFactory = await ethers.getContractFactory("PriceSpotterProcessingLib");
        const processingLib = await processingLibFactory.deploy();
        console.log(`Deployed PriceSpotterProcessingLib at ${processingLib.target}`);

        return processingLib;
    }

    let processingLib: PriceSpotterProcessingLib;

    it("Deploy price spotter processing lib fixture", async () => {
        processingLib = await deployPriceProcessingLibFixture();
        expect(await processingLib.getAddress()).to.be.properAddress;
    });

    it("Test PriceSpotterProcessingLib.finalizeData", async() => {
        const finalizeDataMock = {
            key: "0x70726963652d73747265616d2d64617461000000000000000000000000000000",
            data: [
                "0x0000000000000000000000000000000000000000000000000bd75a5ab29a2000",
                "0x0000000000000000000000000000000000000000000000000bd75a5ab29a2000",
                "0x0000000000000000000000000000000000000000000000000bd75a5ab29a2000"],
            voters: transmitters.map(t => t.address),
            expectedFinalizedData: "0x0000000000000000000000000000000000000000000000000bd75a5ab29a2000"
        };
        const expectedRewardClaimers = [ transmitters[0].address, transmitters[1].address, transmitters[2].address ];

        const key = finalizeDataMock.key;
        const data = finalizeDataMock.data;
        const voters = finalizeDataMock.voters;
        const expectedData = finalizeDataMock.expectedFinalizedData;
        let [success, finalizedData, rewardClaimers] = await processingLib.finalizeData(key, data, voters);
        expect(success).to.be.true;
        expect(finalizedData === expectedData).to.be.true;
        expect(rewardClaimers.length).to.be.greaterThan(0);
        expect(rewardClaimers).to.eql(expectedRewardClaimers);

    });

    it("Test PriceSpotterProcessingLib.finalizeData with some votes empty", async() => {
        const finalizeDataMock = {
            key: "0x70726963652d73747265616d2d64617461000000000000000000000000000000",
            data: [
                "0x0000000000000000000000000000000000000000000000000bd75a5ab29a2000",
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000bd75a5ab29a2000"],
            voters: transmitters.map(t => t.address),
            expectedFinalizedData: "0x0000000000000000000000000000000000000000000000000bd75a5ab29a2000"
        };
        const expectedRewardClaimers = [ transmitters[0].address, transmitters[2].address ];

        const key = finalizeDataMock.key;
        const data = finalizeDataMock.data;
        const voters = finalizeDataMock.voters;
        const expectedData = finalizeDataMock.expectedFinalizedData;
        let [success, finalizedData, rewardClaimers] = await processingLib.finalizeData(key, data, voters);
        expect(success).to.be.true;
        expect(finalizedData === expectedData).to.be.true;
        console.log(`Reward claimers: ${rewardClaimers.join(", ")}`);
        console.log(`Expected reward claimers: ${expectedRewardClaimers.join(", ")}`);
        expect(rewardClaimers.length).to.be.greaterThan(0);
        expect(rewardClaimers).to.eql(expectedRewardClaimers);
    });
});

