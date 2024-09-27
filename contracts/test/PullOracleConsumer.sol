// SPDX-License-Identifier: BSL1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IPullOracle.sol";

contract PullOracleConsumer is Initializable, UUPSUpgradeable, OwnableUpgradeable
{

    IPullOracle public pullOracle;
    mapping (bytes32 => uint256) public lastPrice;

    event PriceUpdated(uint256 oldPrice, uint256 newPrice, address updater, uint256 timestamp);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _pullOracle
    ) public initializer {
        __Ownable_init();
        pullOracle = IPullOracle(_pullOracle);
    }

    function setPullOracle(address _pullOracle) onlyOwner external {
        pullOracle = IPullOracle(_pullOracle);
    }


    function getLastPrice( 
        bytes32 merkleRoot,
        bytes32[] calldata merkleProof,
        IPullOracle.Signature[] calldata signatures,
        bytes32 dataKey,
        uint256 price,
        uint256 timestamp
    ) external {
        uint256 oldPrice = lastPrice[dataKey];
        lastPrice[dataKey] = pullOracle.getLastPrice(merkleRoot, merkleProof, signatures, dataKey, price, timestamp);

        emit PriceUpdated(oldPrice, lastPrice[dataKey], msg.sender, timestamp);
    }


    function _authorizeUpgrade(address) internal override onlyOwner {}

    
}
