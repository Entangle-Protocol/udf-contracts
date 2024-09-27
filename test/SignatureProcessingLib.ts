import { ethers } from "hardhat";
import { SignaturesProcessingLib } from "../typechain-types";
import { expect } from "chai";

describe("SignaturesProcessingLib", () => {
  let processingLib: SignaturesProcessingLib;
  let signers: any[];

  beforeEach(async () => {
    const ProcessingLib = await ethers.getContractFactory("SignaturesProcessingLib");
    processingLib = (await ProcessingLib.deploy()) as SignaturesProcessingLib;

    signers = await ethers.getSigners();
  });

  it("reverts if dataKey is empty", async () => {
    const emptyDataKey = ethers.ZeroHash

    try {
      await processingLib.finalizeData(emptyDataKey, [], [])
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__EmptyDataKey/)
    }
  });

  it("reverts if data is empty", async () => {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));
    const voters = [signers[0].address];

    try {
      await processingLib.finalizeData(dataKey, [], voters)
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__EmptyData/)
    }
  });

  it("reverts if data and voters arrays have different lengths", async () => {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));
    const data = [ethers.randomBytes(32), ethers.randomBytes(32)];
    const voters = [signers[0].address];

    try {
      await processingLib.finalizeData(dataKey, data, voters)
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__DataVotersLengthMismatch/)
    }
  });

  it("reverts if voter is an zero address", async () => {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));
    const data = [ethers.randomBytes(32)];
    const voters = [ethers.ZeroAddress];

    try {
      await processingLib.finalizeData(dataKey, data, voters)
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__ZeroVoterAddress/)
    }
  });

  it("reverts if signature verification fails (v < 27)", async () => {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));
    const signer = signers[0];
    const voters = [signers[0].address];

    const signature = await signer.signMessage(Buffer.from(dataKey.slice(2), "hex"));

    const signatureBytes = Uint8Array.from(Buffer.from(signature.slice(2), "hex"));
    const r = signatureBytes.slice(0, 32);
    const s = signatureBytes.slice(32, 64);
    const v = 26;
    const vBytes = new Uint8Array([v]);

    const data = [ethers.concat([r, s, vBytes])];

    try {
      await processingLib.finalizeData(dataKey, data, voters)
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__InvalidVerification/)
    }
  });

  it("reverts if signature verification fails (v > 28)", async () => {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));
    const signer = signers[0];
    const voters = [signers[0].address];

    const signature = await signer.signMessage(Buffer.from(dataKey.slice(2), "hex"));

    const signatureBytes = Uint8Array.from(Buffer.from(signature.slice(2), "hex"));
    const r = signatureBytes.slice(0, 32);
    const s = signatureBytes.slice(32, 64);
    const v = 29;
    const vBytes = new Uint8Array([v]);

    const data = [ethers.concat([r, s, vBytes])];

    try {
      await processingLib.finalizeData(dataKey, data, voters)
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__InvalidVerification/)
    }
  });

  it("reverts if signature length is invalid", async () => {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));
    const signer = signers[0];
    const voters = [signers[0].address];

    const signature = await signer.signMessage(Buffer.from(dataKey.slice(2), "hex"));

    const signatureBytes = Uint8Array.from(Buffer.from(signature.slice(2), "hex"));
    // For the valid scenarion this should be 32, but we use lengthy value to pass the test
    const r = signatureBytes.slice(0, 33);
    const s = signatureBytes.slice(32, 64);
    const v = signatureBytes[64];
    const vBytes = new Uint8Array([v]);

    const data = [ethers.concat([r, s, vBytes])];

    try {
      await processingLib.finalizeData(dataKey, data, voters)
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__InvalidSignatureLength/)
    }
  });

  it("reverts if signer address is invalid", async () => {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));

    const signer = signers[0];
    const signature = await signer.signMessage(Buffer.from(dataKey.slice(2), "hex"));

    const signatureBytes = Uint8Array.from(Buffer.from(signature.slice(2), "hex"));
    const r = signatureBytes.slice(0, 32);
    const s = signatureBytes.slice(32, 64);
    const v = signatureBytes[64];
    const vBytes = new Uint8Array([v]);

    const data = [ethers.concat([r, s, vBytes])];
    const voters = [signers[1].address];
    try {
      await processingLib.finalizeData(dataKey, data, voters)
      throw new Error("No error was thrown");
    } catch (e) {
      expect((e as Error).message).to.match(/SignaturesProcessingLib__InvalidSigner/)
    }
  });

  it("returns valid result for one signer", async function () {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));

    const signer = signers[0];
    const signature = await signer.signMessage(Buffer.from(dataKey.slice(2), "hex"));

    const signatureBytes = Uint8Array.from(Buffer.from(signature.slice(2), "hex"));
    const r = signatureBytes.slice(0, 32);
    const s = signatureBytes.slice(32, 64);
    const v = signatureBytes[64];
    const vBytes = new Uint8Array([v]);

    // Make sure data is recoverable
    const prefixedDataKey = ethers.keccak256(
      ethers.concat([
        ethers.toUtf8Bytes("\x19Ethereum Signed Message:\n32"),
        dataKey
      ])
    );
    const recoveredAddress = ethers.recoverAddress(prefixedDataKey, ethers.concat([r, s, vBytes]));
    expect(recoveredAddress).to.equal(signer);

    const data = [ethers.concat([r, s, vBytes])];
    const voters = [signer.address];

    const {
      success,
      finalizedData,
      rewardClaimers,
    } = await processingLib.finalizeData(dataKey, data, voters);

    expect(success).to.be.true;

    expect(finalizedData).to.eq('0x28a952762ced96214e3d5e36d0f04efc9145b6fd48779ea6b4bccc6cc794cfad673fdc961a5d7e21cd02a58fd57d2660ed29e5da50edf093c7b855fb5bb51e041b')
    expect(finalizedData).to.eq(ethers.concat([r, s, vBytes]))

    expect(rewardClaimers).to.length(1)
    expect(rewardClaimers[0]).to.eq(signer.address)
  });

  it("returns valid result for multiple signers", async function () {
    const dataKey = ethers.keccak256(ethers.toUtf8Bytes("exampleDataKey"));

    const signer1 = signers[0];
    const signer2 = signers[1];

    const signer1Signature = await signer1.signMessage(Buffer.from(dataKey.slice(2), "hex"));
    const signer1SignatureBytes = Uint8Array.from(Buffer.from(signer1Signature.slice(2), "hex"));
    const r1 = signer1SignatureBytes.slice(0, 32);
    const s1 = signer1SignatureBytes.slice(32, 64);
    const v1 = signer1SignatureBytes[64];
    const v1Bytes = new Uint8Array([v1]);

    const signer2Signature = await signer2.signMessage(Buffer.from(dataKey.slice(2), "hex"));
    const signer2SignatureBytes = Uint8Array.from(Buffer.from(signer2Signature.slice(2), "hex"));
    const r2 = signer2SignatureBytes.slice(0, 32);
    const s2 = signer2SignatureBytes.slice(32, 64);
    const v2 = signer2SignatureBytes[64];
    const v2Bytes = new Uint8Array([v2]);

    const data = [
      ethers.concat([r1, s1, v1Bytes]),
      ethers.concat([r2, s2, v2Bytes]),
    ];
    const voters = [signer1.address, signer2.address];

    const {
      success,
      finalizedData,
      rewardClaimers,
    } = await processingLib.finalizeData(dataKey, data, voters);

    expect(success).to.be.true;

    // expect(finalizedData).to.eq('0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000004128a952762ced96214e3d5e36d0f04efc9145b6fd48779ea6b4bccc6cc794cfad673fdc961a5d7e21cd02a58fd57d2660ed29e5da50edf093c7b855fb5bb51e041b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041893fe538236ca84c0dc9e694bad3617641410213bc6c19f1116bb50c9b35bcfe51e814ed157fe42a8ed46384ef7f9234769998b082f8bd1c207f060aa2940d241c00000000000000000000000000000000000000000000000000000000000000')
    expect(finalizedData).to.eq('0x28a952762ced96214e3d5e36d0f04efc9145b6fd48779ea6b4bccc6cc794cfad673fdc961a5d7e21cd02a58fd57d2660ed29e5da50edf093c7b855fb5bb51e041b893fe538236ca84c0dc9e694bad3617641410213bc6c19f1116bb50c9b35bcfe51e814ed157fe42a8ed46384ef7f9234769998b082f8bd1c207f060aa2940d241c')

    expect(rewardClaimers).to.length(2)
    expect(rewardClaimers[0]).to.eq(signer1.address)
    expect(rewardClaimers[1]).to.eq(signer2.address)
  });
});
