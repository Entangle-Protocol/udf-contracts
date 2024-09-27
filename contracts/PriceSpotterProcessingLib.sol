// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IProcessingLib.sol";

// import "hardhat/console.sol";

contract PriceSpotterProcessingLib is
    IProcessingLib,
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable
{

    error PriceSpotterProcessingLib__Uint256OutOfBounds(bytes data);

    bytes32 public constant ADMIN = keccak256("ADMIN");
    bytes32 public constant DATA_SPOTTER = keccak256("DATA_SPOTTER");
    /// @notice delta of 1%
    uint256 public constant delta = 100;
    uint256 public constant maxDelta = 10000;

    /// @notice Initializer
    /// @param initAddr - 0: admin
    function initialize(address[1] calldata initAddr) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        _grantRole(ADMIN, initAddr[0]);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /*
     * StreamDataSpotter functions
     */

    function finalizeData(
        bytes32,
        bytes[] calldata data,
        address[] calldata voters
    ) external pure returns(
        bool success,
        bytes memory finalizedData,
        address[] memory rewardClaimers
    ) {
        // Convert bytes votes to uint256 array

        // Array that gets sorted during the median calculation
        uint256[] memory uintData = new uint256[](data.length);
        // Array that keeps the initial order of votes. This is done this way to return
        // the rewardClaimers in the same order as the voters array
        uint256[] memory origOrderUintData = new uint256[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            uintData[i] = abi.decode(data[i], (uint256));
            origOrderUintData[i] = uintData[i];
        }

        // Get median as final data
        uint256 median = getMedian(uintData);
        finalizedData = abi.encode(median);

        // Get keepers that voted close enough for the median
        // to reward them in StreamDataSpotter
        uint256 rewardAllowedDeviation = median * delta / maxDelta;

        // TODO: Rewrite this to more elegant solution than 2 loops, it is done
        // this way since we can't create memory arrays with dynamic size in solidity
        // First calculate size of rewarders
        uint256 rewardersCount = 0;
        for (uint256 i = 0; i < origOrderUintData.length; i++) {
            uint256 vote = origOrderUintData[i];
            // Replacement for abs(vote - median)
            if (median >= vote) {
                if (median - vote <= rewardAllowedDeviation) {
                    rewardersCount++;
                }
            } else {
                if (vote - median <= rewardAllowedDeviation) {
                    rewardersCount++;
                }
            }
        }

        // Fill rewardClaimers array
        rewardClaimers = new address[](rewardersCount);
        // Current rewarder index
        uint256 rewarderIdx = 0;
        for (uint256 i = 0; i < origOrderUintData.length; i++) {
            uint256 vote = origOrderUintData[i];
            // Replacement for abs(vote - median)
            if (median >= vote) {
                if (median - vote <= rewardAllowedDeviation) {
                    rewardClaimers[rewarderIdx++] = voters[i];
                }
            } else {
                if (vote - median <= rewardAllowedDeviation) {
                    rewardClaimers[rewarderIdx++] = voters[i];
                }
            }
        }

        success = true;

        return (success, finalizedData, rewardClaimers);
    }

    /// @notice sorts and calculates median of provided unsorted array
    /// @param arr - array of uint
    /// @return median of the array
    function getMedian(uint[] memory arr) internal pure returns (uint) {
        quickSort(arr, 0, int(arr.length - 1));
        return arr[arr.length / 2];
    }

    /// @notice QuickSort recursive implementation
    /// @dev Taken from https://gist.github.com/subhodi/b3b86cc13ad2636420963e692a4d896f
    function quickSort(uint[] memory arr, int left, int right) internal pure {
        int i = left;
        int j = right;
        if(i==j) return;
        uint pivot = arr[uint(left + (right - left) / 2)];
        while (i <= j) {
            while (arr[uint(i)] < pivot) i++;
            while (pivot < arr[uint(j)]) j--;
            if (i <= j) {
                (arr[uint(i)], arr[uint(j)]) = (arr[uint(j)], arr[uint(i)]);
                // (voters[uint(i)], voters[uint(j)]) = (voters[uint(j)], voters[uint(i)]);
                i++;
                j--;
            }
        }
        if (left < j)
            quickSort(arr, left, j);
        if (i < right)
            quickSort(arr, i, right);
    }

    function toUint256(bytes memory _bytes, uint256 _start) internal pure returns (uint256) {
        if (_bytes.length > _start + 32) {
            revert PriceSpotterProcessingLib__Uint256OutOfBounds(_bytes);
        }
        uint256 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x20), _start))
        }

        return tempUint;
    }
}
