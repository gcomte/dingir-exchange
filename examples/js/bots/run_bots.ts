import { MMByPriceBot } from "./mm_external_price_bot";
import * as regression from "regression";
import { Account } from "fluidex.js";
import { defaultRESTClient, RESTClient } from "../RESTClient";
import { defaultClient as defaultGrpcClient, Client as grpcClient, defaultClient } from "../client";
import { sleep } from "../util";
import { ORDER_SIDE_BID, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, VERBOSE } from "../config";
import {
  estimateMarketOrderSell,
  estimateMarketOrderBuy,
  execMarketOrderAsLimit_Sell,
  execMarketOrderAsLimit_Buy,
  rebalance,
  printBalance,
  totalBalance,
} from "./utils";
import { executeOrders } from "./executor";
import { depositAssets, getPriceOfCoin } from "../exchange_helper";

//const VERBOSE = false;
console.log({ VERBOSE });

const market = "ETH_USDT";
const baseCoin = "ETH";
const quoteCoin = "USDT";

async function main() {
  const user_id = 3; // dummy user id

  await defaultClient.connect();

  await rebalance(user_id, baseCoin, quoteCoin, market);

  let bot = new MMByPriceBot();
  bot.init(user_id, "bot1", defaultClient, baseCoin, quoteCoin, market, null, VERBOSE);
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
        console.log(await defaultClient.orderQuery(user, market));
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

      await executeOrders(defaultClient, market, user, reset, orders, 0.001, false);
    } catch (e) {
      console.log("err", e);
    }
  }
}

main();
