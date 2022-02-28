import { defaultClient as client } from "../client";
import { TestUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, ORDER_SIDE_BID, fee } from "../config";
import { depositAssets } from "../exchange_helper";
import { assertDecimalEqual } from "../util";

const depositAdmin = TestUser.DEPOSIT_ADMIN;
const askUser = TestUser.USER1;
const askUserId = process.env.KC_USER1_ID;
const bidUser = TestUser.USER2;
const bidUserId = process.env.KC_USER2_ID;

async function infoList() {
  console.log(await client.assetList({}));
  console.log(await client.marketList({}));
  console.log(await client.marketSummary({}, market));
}

async function setupAsset() {
  // check balance is zero
  const balance1 = await client.balanceQuery(askUser);
  let btcBalance = balance1.get("BTC");
  let difBalance = balance1.get("DIF");
  assertDecimalEqual(btcBalance.available, "0");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "0");
  assertDecimalEqual(difBalance.frozen, "0");

  await depositAssets({ BTC: "100.0", DIF: "50.0" }, askUserId, depositAdmin);

  // check deposit success
  const balance2 = await client.balanceQuery(askUser);
  btcBalance = balance2.get("BTC");
  difBalance = balance2.get("DIF");
  assertDecimalEqual(btcBalance.available, "100");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "50");
  assertDecimalEqual(difBalance.frozen, "0");

  await depositAssets({ BTC: "100.0", DIF: "50.0" }, bidUserId, depositAdmin);
}

async function checkAskUserBalance() {
  const balanceAsk = await client.balanceQuery(askUser);
  const btcBalance = balanceAsk.get("BTC");
  const difBalance = balanceAsk.get("DIF");
  assertDecimalEqual(btcBalance.available, "108");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "46");
  assertDecimalEqual(difBalance.frozen, "0");
}

async function checkBidUserBalance() {
  const balanceBid = await client.balanceQuery(bidUser);
  const btcBalance = balanceBid.get("BTC");
  const difBalance = balanceBid.get("DIF");
  assertDecimalEqual(btcBalance.available, "92");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "54");
  assertDecimalEqual(difBalance.frozen, "0");
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
  const btcBalance = balanceBid.get("BTC");
  const difBalance = balanceBid.get("DIF");
  assertDecimalEqual(btcBalance.available, "32");
  assertDecimalEqual(btcBalance.frozen, "60");
  assertDecimalEqual(difBalance.available, "54");
  assertDecimalEqual(difBalance.frozen, "0");

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
  const btcBalance = balanceAsk.get("BTC");
  const difBalance = balanceAsk.get("DIF");
  assertDecimalEqual(btcBalance.available, "108");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "40");
  assertDecimalEqual(difBalance.frozen, "6");

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
