// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IProcessingLib.sol";

contract SignaturesProcessingLib is
    IProcessingLib,
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    error SignaturesProcessingLib__EmptyDataKey();
    error SignaturesProcessingLib__EmptyData();
    error SignaturesProcessingLib__DataVotersLengthMismatch();
    error SignaturesProcessingLib__InvalidSignatureLength();
    error SignaturesProcessingLib__InvalidVerification();
    error SignaturesProcessingLib__ZeroVoterAddress();
    error SignaturesProcessingLib__InvalidSigner();
    error SignaturesProcessingLib__EmptyVerifiedVoters();

    bytes32 public constant ADMIN = keccak256("ADMIN");
    uint256 public constant SIGNATURE_LENGTH = 65;

    /// @notice Initializer
    /// @param initAddr - 0: admin
    function initialize(address[1] calldata initAddr) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, initAddr[0]);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * @notice Finalizes the voting data by verifying the signatures of the voters.
     * @dev Verifies the signatures provided by voters against the given data key.
     * @param dataKey The unique identifier for the set of data being finalized.
     * @param data An array of byte arrays, each containing the signature of a voter on the corresponding data.
     * @param voters An array of addresses representing the voters who provided the signatures.
     * @return success A boolean indicating whether the verification process was successful.
     * @return finalizedData The finalized voting data, encoded as a byte array.
     * @return rewardClaimers An array of addresses representing the voters who are eligible to claim rewards.
     */
    function finalizeData(
        bytes32 dataKey,
        bytes[] calldata data,
        address[] calldata voters
    ) external override pure returns (
        bool success,
        bytes memory finalizedData,
        address[] memory rewardClaimers
    ) {
        if (dataKey == bytes32(0)) revert SignaturesProcessingLib__EmptyDataKey();
        if (data.length == 0) revert SignaturesProcessingLib__EmptyData();
        if (data.length != voters.length) revert SignaturesProcessingLib__DataVotersLengthMismatch();

        address[] memory verifiedVoters = new address[](voters.length);
        uint256 verifiedCount = 0;

        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedDataKey = keccak256(abi.encodePacked(prefix, dataKey));

        for (uint256 i = 0; i < data.length; i++) {
            if (voters[i] == address(0)) revert SignaturesProcessingLib__ZeroVoterAddress();

            address signer = recoverSigner(prefixedDataKey, data[i]);

            if (signer != voters[i]) revert SignaturesProcessingLib__InvalidSigner();

            verifiedVoters[verifiedCount] = voters[i];
            verifiedCount++;
        }

        // This case is almost impossible, so it cannot be tested because of first two checks.
        if (verifiedCount == 0) revert SignaturesProcessingLib__EmptyVerifiedVoters();

        success = true;

        // Encode finalizedData into merged array of signatures,
        // 65 byte each, no padding
        finalizedData = new bytes(data.length * SIGNATURE_LENGTH);
        for (uint256 i = 0; i < data.length; i++) {

            bytes memory sig = data[i];
            uint256 curSignatureOffset = i * SIGNATURE_LENGTH;
            bytes32 r; bytes32 s; uint8 v;
            assembly {

                // Load signature values from sig calldata
                r := mload(add(sig, 32))
                s := mload(add(sig, 64))
                v := byte(0, mload(add(sig, 96)))

                // Store signature values in finalizedData in R, S, V format,
                mstore(add(finalizedData, add(curSignatureOffset, 32)), r)
                mstore(add(finalizedData, add(curSignatureOffset, 64)), s)
                mstore8(add(finalizedData, add(curSignatureOffset, 96)), v)
            }
        }

        rewardClaimers = new address[](verifiedCount);
        for (uint256 i = 0; i < verifiedCount; i++) {
            rewardClaimers[i] = verifiedVoters[i];
        }
    }

    function recoverSigner(bytes32 prefixedDataKey, bytes memory sig) private pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(sig);

        if (!(v == 27 || v == 28)) revert SignaturesProcessingLib__InvalidVerification();

        return ecrecover(prefixedDataKey, v, r, s);
    }

    function splitSignature(bytes memory sig) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (sig.length != SIGNATURE_LENGTH) revert SignaturesProcessingLib__InvalidSignatureLength();

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
