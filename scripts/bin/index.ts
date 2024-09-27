import { task, types } from "hardhat/config";
import "./signatures";

task("datafeeds:deploy", "Deploy Stream Data protocol")
    .setAction(async () => {
        const { deployPriceStreamData } = await import("./deployPriceStreamData");
        await deployPriceStreamData();
    });

task("datafeeds:stat", "Run datafeeds stats cmd")
    .setAction(async () => {
        const { runStatsCmd } = await import("./stats");
        await runStatsCmd();
    });
