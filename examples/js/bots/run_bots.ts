import { MMByPriceBot } from "./mm_external_price_bot";
import * as regression from "regression";
import { defaultClient } from "../client";
import { sleep } from "../util";
import { VERBOSE, TestUser } from "../config";
import { rebalance, printBalance, totalBalance } from "./utils";
import { executeOrders } from "./executor";
import { depositAssets, getPriceOfCoin } from "../exchange_helper";

//const VERBOSE = false;
console.log({ VERBOSE });

const market = "BTC_FEE";
const baseCoin = "BTC";
const quoteCoin = "FEE";

async function main(user_id: TestUser) {
  await defaultClient.connect();

  await depositAssets({ BTC: "10", FEE: "10" }, user_id);
  await rebalance(user_id, baseCoin, quoteCoin, market);

  let bot = new MMByPriceBot();
  bot.init(user_id, "bot" + user_id, defaultClient, baseCoin, quoteCoin, market, null, VERBOSE);
  bot.priceFn = async function (coin: string) {
    return await getPriceOfCoin(coin, 5, "coinstats");
  };
  let balanceStats = [];
  let count = 0;
  const startTime = Date.now() / 1000;
  const { totalValue: totalValueWhenStart } = await totalBalance(user_id, baseCoin, quoteCoin, market);
  while (true) {
    if (VERBOSE) {
      console.log("count:", count);
    }
    count += 1;
    if (VERBOSE) {
      console.log("sleep 500ms");
    }
    await sleep(500);
    try {
      if (count % 100 == 1) {
        const t = Date.now() / 1000; // ms
        console.log("stats of", bot.name);
        console.log("orders:");
        console.log(await defaultClient.orderQuery(user_id, market));
        console.log("balances:");
        await printBalance(user_id, baseCoin, quoteCoin, market);
        let { totalValue } = await totalBalance(user_id, baseCoin, quoteCoin, market);
        balanceStats.push([t, totalValue]);
        if (balanceStats.length >= 2) {
          const pastHour = (t - startTime) / 3600;
          const assetRatio = totalValue / totalValueWhenStart;
          console.log("time(hour)", pastHour, "asset ratio", assetRatio);
          console.log("current ROI per hour:", (assetRatio - 1) / pastHour);
          // we should use exp regression rather linear
          const hourDelta = 3600 * regression.linear(balanceStats).equation[0];
          console.log("regression ROI per hour:", hourDelta / totalValueWhenStart);
        }
      }

      const oldOrders = await defaultClient.orderQuery(user_id, market);
      if (VERBOSE) {
        console.log("oldOrders", oldOrders);
      }

      const balance = await defaultClient.balanceQuery(user_id);
      const { reset, orders } = await bot.tick(balance, oldOrders);

      await executeOrders(defaultClient, market, user_id, reset, orders, 0.001, false);
    } catch (e) {
      console.log("err", e);
      // clear the token cache to get new tokens if the signature is expired
      if (e.details === "ExpiredSignature") {
        defaultClient.clearTokenCache();
      }
    }
  }
}

main(TestUser.USER1);
main(TestUser.USER2);
