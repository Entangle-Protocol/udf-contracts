// SPDX-License-Identifier: BSL1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@entangle_protocol/oracle-sdk/contracts/EndPoint.sol";

import "./lib/UnsafeCalldataBytesLib.sol";

contract PullOracle is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    error PullOracle__InvalidSigner(address);
    error PullOracle__InvalidMerkleProof(bytes32, bytes32, bytes32[]);
    error PullOracle__TransmittersNotSetForProtocol(bytes32);
    error PullOracle__ConsensusRateNotSetForProtocol(bytes32);
    error PullOracle__InsufficientSignatures(uint256, uint256);

    /// @notice 10000 = 100%
    uint256 constant rateDecimals = 10000;

    bytes32 public protocolId;
    EndPoint public endPoint;

    struct LatestUpdate {
        /// @notice The price for asset from latest update
        uint256 latestPrice;
        /// @notice The timestamp of latest update
        uint256 latestTimestamp;
    }

    /// @notice mapping of dataKey to the latest update
    mapping(bytes32 dataKey => LatestUpdate) public latestUpdate;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        bytes32 _protocolId,
        address _endPoint
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        protocolId = _protocolId;
        endPoint = EndPoint(_endPoint);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @dev Represents a digital signature
    struct Signature {
        bytes32 r; // The first 32 bytes of the signature
        bytes32 s; // The second 32 bytes of the signature
        uint8 v; // The recovery byte
    }

    // @notice Verifies that the update was emitted on EOB. It does so by checking
    // @dev following properties:
    // * Calculated merkle root of Update + merkle proofs, and ensure that it is
    //   equal to the provided merkle root
    // * Validate the signatures of EOB agents on the Merkle root to ensure
    //   merkle root integrity. The consensus check passes only if the number of valid
    //   unique signatures meets or exceeds the protocol's consensus rate threshold.
    function getLastPrice(
        bytes32 merkleRoot,
        bytes32[] calldata merkleProof,
        Signature[] calldata signatures,
        bytes32 dataKey,
        uint256 price,
        uint256 timestamp
    ) external returns (uint256) {

        // Check that the proof is valid
        // IMPORTANT: Use the values in the same order as the contract that generated the proof
        bytes memory encodedBytes = abi.encode(
            timestamp,
            abi.encode(price),
            dataKey
        );
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(encodedBytes))
        );
        if (!MerkleProof.verify(merkleProof, merkleRoot, leaf)) {
            revert PullOracle__InvalidMerkleProof(merkleRoot, leaf, merkleProof);
        }

        bytes32 merkleRootBytes = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                merkleRoot
            )
        );

        // Get the number of allowed transmitters for the protocol
        uint256 protocolNumberOfAllowedTransmitters = endPoint.numberOfAllowedTransmitters(protocolId);
        if (protocolNumberOfAllowedTransmitters == 0) {
            revert PullOracle__TransmittersNotSetForProtocol(protocolId);
        }

        // Check that provided signatures >= protocol consensus rate
        (,uint256 protocolConsensusRate) = endPoint.allowedProtocolInfo(protocolId);
        if (protocolConsensusRate == 0) {
            revert PullOracle__ConsensusRateNotSetForProtocol(protocolId);
        }

        // Temporary array to store the signers to check for duplicates
        address[] memory uniqueSigners = new address[](signatures.length);
        uint256 nUniqueSigners = 0;
        bool consensusReached = false;

        // Check that the signatures are valid
        for (uint i; i < signatures.length; ) {
            address signer = ecrecover(
                merkleRootBytes,
                signatures[i].v,
                signatures[i].r,
                signatures[i].s
            );

            // Check that the signer is not the null address
            if (signer != address(0)) {

                // Confirm that the signer is allowed transmitter
                bool isAllowed = endPoint.allowedTransmitters(protocolId, signer);
                if (isAllowed) {

                    // Create value to check if signer is unique
                    bool isNewSigner = true;
                    for (uint j; j < nUniqueSigners; ) {
                        // Check through array of unique signers to see if signer is already there
                        if (uniqueSigners[j] == signer) {
                            isNewSigner = false;
                            break;
                        }
                        unchecked {
                            j++;
                        }
                    }

                    if (isNewSigner) {
                        uniqueSigners[nUniqueSigners] = signer;
                        unchecked {
                            nUniqueSigners++;
                        }

                        uint256 consensusRate = (nUniqueSigners * rateDecimals) / protocolNumberOfAllowedTransmitters;
                        if (consensusRate >= protocolConsensusRate) {
                            consensusReached = true;
                            break;
                        }
                    }

                    // If signer is not unqiue, don't do anything
                }
            }

            unchecked {
                i++;
            }
        }

        if (!consensusReached) {
            // + 9999 to get upper bound of division (round up)
            uint256 neededSignatures = (protocolNumberOfAllowedTransmitters * protocolConsensusRate + 9999) / 10000;
            revert PullOracle__InsufficientSignatures(nUniqueSigners, neededSignatures);
        }

        // If timestamp if newer than saved value, update the latest price and timestamp
        if (timestamp > latestUpdate[dataKey].latestTimestamp) {
            latestUpdate[dataKey].latestPrice = price;
            latestUpdate[dataKey].latestTimestamp = timestamp;
        }

        return price;
    }

    /// @notice Update multiple assets in a single tx. Accepts verification bytes in EVM-specific format
    /// @param encodedData The encoded data - `<merkle_root><sigs_length><sigs_array><updates_length><updates>`
    /**
    * @dev Data format for EVM chain updates.
    *
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
    function updateMultipleAssets(
        bytes calldata encodedData
    ) external {

        // Parse merkle root
        uint256 calldataIndex;
        bytes32 merkleRoot = UnsafeCalldataBytesLib.toBytes32(encodedData, calldataIndex);
        bytes32 merkleRootBytes = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                merkleRoot
            )
        );
        unchecked { calldataIndex += 32; }

        // Parse transmitter signatures length
        uint8 sigsLength = UnsafeCalldataBytesLib.toUint8(encodedData, calldataIndex);
        unchecked { calldataIndex += 1; }

        // Signature validnes checks
        // Steps need to perform:
        // * Check that signatures are valid and belong to protocol transmitters
        // * Check that unique signtures are enough to reach consensus

        // Get the number of allowed transmitters for the protocol
        uint256 protocolNumberOfAllowedTransmitters = endPoint.numberOfAllowedTransmitters(protocolId);
        if (protocolNumberOfAllowedTransmitters == 0) {
            revert PullOracle__TransmittersNotSetForProtocol(protocolId);
        }

        // Check that provided signatures >= protocol consensus rate
        (,uint256 protocolConsensusRate) = endPoint.allowedProtocolInfo(protocolId);
        if (protocolConsensusRate == 0) {
            revert PullOracle__ConsensusRateNotSetForProtocol(protocolId);
        }

        // Temporary array to store the signers to check for duplicates
        address[] memory uniqueSigners = new address[](sigsLength);
        uint256 nUniqueSigners = 0;
        bool consensusReached = false;

        // Check that the signatures are valid
        for (uint i; i < sigsLength; ) {

            // Parse signature
            bytes32 r = UnsafeCalldataBytesLib.toBytes32(encodedData, calldataIndex);
            unchecked { calldataIndex += 32; }
            bytes32 s = UnsafeCalldataBytesLib.toBytes32(encodedData, calldataIndex);
            unchecked { calldataIndex += 32; }
            uint8 v = UnsafeCalldataBytesLib.toUint8(encodedData, calldataIndex);
            unchecked { calldataIndex += 1; }

            address signer = ecrecover(
                merkleRootBytes,
                v,
                r,
                s
            );

            // Check that the signer is not the null address
            if (signer != address(0)) {

                // Confirm that the signer is allowed transmitter
                bool isAllowed = endPoint.allowedTransmitters(protocolId, signer);
                if (isAllowed) {

                    // Check if signer is unique
                    bool isNewSigner = true;
                    for (uint j; j < nUniqueSigners; ) {
                        // Check through array of unique signers to see if signer is already there
                        if (uniqueSigners[j] == signer) {
                            isNewSigner = false;
                            break;
                        }
                        unchecked {
                            j++;
                        }
                    }

                    // Route for new signer
                    if (isNewSigner) {
                        uniqueSigners[nUniqueSigners] = signer;
                        unchecked {
                            nUniqueSigners++;
                        }

                        // If consensus rate is already reached, exit the loop
                        uint256 consensusRate = (nUniqueSigners * rateDecimals) / protocolNumberOfAllowedTransmitters;
                        if (consensusRate >= protocolConsensusRate) {
                            consensusReached = true;
                            break;
                        }
                    }

                    // If signer is not unqiue, don't do anything
                }
            }

            unchecked {
                i++;
            }
        }

        // Check that conensus is reached
        if (!consensusReached) {
            // + 9999 to get upper bound of division (round up)
            uint256 neededSignatures = (protocolNumberOfAllowedTransmitters * protocolConsensusRate + 9999) / 10000;
            revert PullOracle__InsufficientSignatures(nUniqueSigners, neededSignatures);
        }

        // Parse updates
        uint8 updateLength = UnsafeCalldataBytesLib.toUint8(encodedData, calldataIndex);
        unchecked { calldataIndex += 1; }

        for (uint i; i < updateLength; ) {

            // Parse and verify the update

            // Parse merkle proof
            uint8 proofsLength = UnsafeCalldataBytesLib.toUint8(encodedData, calldataIndex);
            unchecked { calldataIndex += 1; }
            bytes32[] memory merkleProof = new bytes32[](proofsLength);
            for (uint j; j < proofsLength; ) {
                merkleProof[j] = UnsafeCalldataBytesLib.toBytes32(encodedData, calldataIndex);
                unchecked { calldataIndex += 32; }
                unchecked { j++; }
            }

            // Parse update values
            uint256 timestamp = UnsafeCalldataBytesLib.toUint256(encodedData, calldataIndex);
            unchecked { calldataIndex += 32; }
            uint256 price = UnsafeCalldataBytesLib.toUint256(encodedData, calldataIndex);
            unchecked { calldataIndex += 32; }
            bytes32 dataKey = UnsafeCalldataBytesLib.toBytes32(encodedData, calldataIndex);
            unchecked { calldataIndex += 32; }

            // Check that the proof is valid
            // IMPORTANT: Use the values in the same order as the contract that generated the proof
            bytes memory encodedBytes = abi.encode(
                timestamp,
                abi.encode(price),
                dataKey
            );
            bytes32 leaf = keccak256(
                bytes.concat(keccak256(encodedBytes))
            );
            if (!MerkleProof.verify(merkleProof, merkleRoot, leaf)) {
                revert PullOracle__InvalidMerkleProof(merkleRoot, leaf, merkleProof);
            }

            // If the timestamp of new update is older than the latest timestamp,
            // parse and ignore this update
            if (timestamp <= latestUpdate[dataKey].latestTimestamp) {
                unchecked { i++; }
                continue;
            }

            // Update the latest price and timestamp
            latestUpdate[dataKey].latestPrice = price;
            latestUpdate[dataKey].latestTimestamp = timestamp;

            unchecked { i++; }
        }

    }
}
