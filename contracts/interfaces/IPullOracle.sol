// SPDX-License-Identifier: BSL 1.1
pragma solidity 0.8.19;

interface IPullOracle {
    struct LatestUpdate {
        /// @notice The price for asset from latest update
        uint256 latestPrice;
        /// @notice The timestamp of latest update
        uint256 latestTimestamp;
    }

    /// @dev Represents a digital signature
    struct Signature {
        bytes32 r; // The first 32 bytes of the signature
        bytes32 s; // The second 32 bytes of the signature
        uint8 v; // The recovery byte
    }

    /// @notice mapping of dataKey to the latest update
    function latestUpdate(bytes32 dataKey) external pure returns (LatestUpdate memory);

    // @notice Verifies that the update was emitted on EOB. It does so by checking
    // @dev following properties:
    // * Calculated merkle root of (Update + merkle proofs) is equal to the provided merkle root
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
    ) external returns (uint256);
}
