# Universal Data Feeds (UDF)
Access tools for creating secure, verifiable data oracles from any data source with delivery to any EVM and non-EVM networks. The project includes modules for developing custom oracles as well as for preparing APIs for deployment in the public Universal Data Feeds network.

# Price Oracle Smart Contracts

Repo for Entangle Data Feeds contracts.

# CLI commands

Deploy script is executed through hardhat task:

`$ yarn hardhat deploy-stream-data`

The following commands are accessible through deploy script.

* Deploy PullOracle contracts on destination chains
* Register Data Feeds protocol on External Developer Hub
* Initialize Data Feeds protocol

# The order in which deploy must be called

1. Deploy PullOracle contracts on dest chains
2. Register PriceStreamData protocol on MAS
3. Initialize PriceStreamData protocol
3. Deploy PriceStreamData spotters
3. Additional steps after initializing and round turns
