# Universal Data Feeds (UDF)

This repository holds configurable UDF contracts used for data collection, as well as smart contracts used on target chain to receive and verify the updates.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [License](#license)

Generally, describe the project and readme and provide and additional details, that will help community to interact with your repository

## Installation

First, clone the repo.

```
$ git clone git@github.com:Entangle-Protocol/udf-contracts.git
```

Install dependencies

```
$ yarn install
```

Run tests

```
$ yarn hardhat test
```

## Usage

The repository contains various utility scripts to interact with smart contracts on oralce network (EOB). The scripts are integrated as hardhat tasks and can be navigated through the CLI under the supported categories:

* Scripts to deploy and live actions on the deployed protocol instance 
```
$ yarn hardhat datafeeds:deploy
```

* Scripts to observe the state of the deployed protocol 
```
$ yarn hardhat datafeeds:stat
```

## Changelog

[Changelog history](CHANGELOG.md)

## Contributing

[Contributing information](CONTRIBUTING.md)

## Code of conduct

[Regulations](CODE_OF_CONDUCT.md)

## License

[License](LICENSE)
