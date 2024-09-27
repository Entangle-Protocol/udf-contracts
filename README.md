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
