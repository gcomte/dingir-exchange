import { defaultClient as client } from "../client";
import { TestUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, ORDER_SIDE_BID, fee } from "../config";
import { depositAssets } from "../exchange_helper";
import { assertDecimalEqual } from "../util";

const askUser = TestUser.USER1;
const bidUser = TestUser.USER2;

async function infoList() {
  console.log(await client.assetList({}));
  console.log(await client.marketList({}));
  console.log(await client.marketSummary({}, market));
}

async function setupAsset() {
  // check balance is zero
  const balance1 = await client.balanceQuery(askUser);
  let usdtBalance = balance1.get("USDT");
  let ethBalance = balance1.get("ETH");
  assertDecimalEqual(usdtBalance.available, "0");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "0");
  assertDecimalEqual(ethBalance.frozen, "0");

  await depositAssets({ USDT: "100.0", ETH: "50.0" }, askUser);

  // check deposit success
  const balance2 = await client.balanceQuery(askUser);

  usdtBalance = balance2.get("USDT");
  ethBalance = balance2.get("ETH");
  assertDecimalEqual(usdtBalance.available, "100");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "50");
  assertDecimalEqual(ethBalance.frozen, "0");

  await depositAssets({ USDT: "100.0", ETH: "50.0" }, bidUser);
}

async function checkAskUserBalance() {
  const balanceAsk = await client.balanceQuery(askUser);
  const usdtBalance = balanceAsk.get("USDT");
  const ethBalance = balanceAsk.get("ETH");
  assertDecimalEqual(usdtBalance.available, "108");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "46");
  assertDecimalEqual(ethBalance.frozen, "0");
}

async function checkBidUserBalance() {
  const balanceBid = await client.balanceQuery(bidUser);
  const usdtBalance = balanceBid.get("USDT");
  const ethBalance = balanceBid.get("ETH");
  assertDecimalEqual(usdtBalance.available, "92");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "54");
  assertDecimalEqual(ethBalance.frozen, "0");
}

async function wrongBidPriceTest() {
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "10", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  await checkAskUserBalance();
  await checkBidUserBalance();

  console.log("wrongBidPriceTest successfull");
}

async function wrongBidPriceWithBigVolumeTest() {
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "10", /*price*/ "10", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  await checkAskUserBalance();
  const balanceBid = await client.balanceQuery(bidUser);
  const usdtBalance = balanceBid.get("USDT");
  const ethBalance = balanceBid.get("ETH");
  assertDecimalEqual(usdtBalance.available, "32");
  assertDecimalEqual(usdtBalance.frozen, "60");
  assertDecimalEqual(ethBalance.available, "54");
  assertDecimalEqual(ethBalance.frozen, "0");

  const openOrders = await client.orderQuery(bidUser, market);

  assertDecimalEqual(openOrders.orders[0].remain, "6");
  assertDecimalEqual(openOrders.orders[0].price, "10");

  console.log("wrongBidPriceWithBigVolumeTest successfull");
}

async function wrongAskPriceTest() {
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "0.1", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  await checkAskUserBalance();
  await checkBidUserBalance();

  console.log("wrongAskPriceTest successfull");
}

async function wrongAskPriceWithBigVolumeTest() {
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "10", /*price*/ "0.1", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  await checkBidUserBalance();
  const balanceAsk = await client.balanceQuery(askUser);
  const usdtBalance = balanceAsk.get("USDT");
  const ethBalance = balanceAsk.get("ETH");
  assertDecimalEqual(usdtBalance.available, "108");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "40");
  assertDecimalEqual(ethBalance.frozen, "6");

  const openOrders = await client.orderQuery(askUser, market);

  assertDecimalEqual(openOrders.orders[0].remain, "6");
  assertDecimalEqual(openOrders.orders[0].price, "0.1");

  console.log("wrongAskPriceWithBigVolumeTest successfull");
}

async function beforeEach() {
  await client.debugReset(await client.auth.getAuthTokenMeta(TestUser.ADMIN));
  await setupAsset();
}

async function main() {
  const tests = [wrongBidPriceTest, wrongAskPriceTest, wrongBidPriceWithBigVolumeTest, wrongAskPriceWithBigVolumeTest];

  try {
    await infoList();
    for (const test of tests) {
      await beforeEach();
      await test();
    }
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}

main();
