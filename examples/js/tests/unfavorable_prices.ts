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
  let usdtBalance = balance1.get("USDT");
  let ethBalance = balance1.get("ETH");
  assertDecimalEqual(usdtBalance.available, "0");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "0");
  assertDecimalEqual(ethBalance.frozen, "0");

  await depositAssets({ USDT: "100.0", ETH: "50.0" }, askUserId, depositAdmin);

  // check deposit success
  const balance2 = await client.balanceQuery(askUser);

  usdtBalance = balance2.get("USDT");
  ethBalance = balance2.get("ETH");
  assertDecimalEqual(usdtBalance.available, "100");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "50");
  assertDecimalEqual(ethBalance.frozen, "0");

  await depositAssets({ USDT: "100.0", ETH: "50.0" }, bidUserId, depositAdmin);
}

async function wrongBidPriceTest() {
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "10", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  // the trade should have happend with a price of "2"
  const balanceAsk = await client.balanceQuery(askUser);
  let usdtBalance = balanceAsk.get("USDT");
  let ethBalance = balanceAsk.get("ETH");
  assertDecimalEqual(usdtBalance.available, "108");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "46");
  assertDecimalEqual(ethBalance.frozen, "0");

  const balanceBid = await client.balanceQuery(bidUser);
  usdtBalance = balanceBid.get("USDT");
  ethBalance = balanceBid.get("ETH");
  assertDecimalEqual(usdtBalance.available, "92");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "54");
  assertDecimalEqual(ethBalance.frozen, "0");

  console.log("wrongBidPriceTest successfull");
}

async function wrongAskPriceTest() {
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "0.1", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  // the trade should have happend with a price of "2"
  const balanceAsk = await client.balanceQuery(askUser);
  let usdtBalance = balanceAsk.get("USDT");
  let ethBalance = balanceAsk.get("ETH");
  assertDecimalEqual(usdtBalance.available, "116");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "42");
  assertDecimalEqual(ethBalance.frozen, "0");

  const balanceBid = await client.balanceQuery(bidUser);
  usdtBalance = balanceBid.get("USDT");
  ethBalance = balanceBid.get("ETH");
  assertDecimalEqual(usdtBalance.available, "84");
  assertDecimalEqual(usdtBalance.frozen, "0");
  assertDecimalEqual(ethBalance.available, "58");
  assertDecimalEqual(ethBalance.frozen, "0");

  console.log("wrongAskPriceTest successfull");
}

async function main() {
  try {
    await client.debugReset(await client.auth.getAuthTokenMeta(TestUser.ADMIN));
    await infoList();
    await setupAsset();
    await wrongBidPriceTest();
    await wrongAskPriceTest();
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}

main();
