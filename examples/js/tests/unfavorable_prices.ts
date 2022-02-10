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
  let btcBalance = balance1.get("BTC");
  let difBalance = balance1.get("DIF");
  assertDecimalEqual(btcBalance.available, "0");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "0");
  assertDecimalEqual(difBalance.frozen, "0");

  await depositAssets({ BTC: "100.0", DIF: "50.0" }, askUser);

  // check deposit success
  const balance2 = await client.balanceQuery(askUser);
  btcBalance = balance2.get("BTC");
  difBalance = balance2.get("DIF");
  assertDecimalEqual(btcBalance.available, "100");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "50");
  assertDecimalEqual(difBalance.frozen, "0");

  await depositAssets({ BTC: "100.0", DIF: "50.0" }, bidUser);
}

async function wrongBidPriceTest() {
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "10", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  // the trade should have happend with a price of "2"
  const balanceAsk = await client.balanceQuery(askUser);
  let btcBalance = balanceAsk.get("BTC");
  let difBalance = balanceAsk.get("DIF");
  assertDecimalEqual(btcBalance.available, "108");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "46");
  assertDecimalEqual(difBalance.frozen, "0");

  const balanceBid = await client.balanceQuery(bidUser);
  btcBalance = balanceBid.get("BTC");
  difBalance = balanceBid.get("DIF");
  assertDecimalEqual(btcBalance.available, "92");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "54");
  assertDecimalEqual(difBalance.frozen, "0");

  console.log("wrongBidPriceTest successfull");
}

async function wrongAskPriceTest() {
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "2", fee, fee);
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "0.1", fee, fee);

  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);

  // the trade should have happend with a price of "2"
  const balanceAsk = await client.balanceQuery(askUser);
  let btcBalance = balanceAsk.get("BTC");
  let difBalance = balanceAsk.get("DIF");
  assertDecimalEqual(btcBalance.available, "116");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "42");
  assertDecimalEqual(difBalance.frozen, "0");

  const balanceBid = await client.balanceQuery(bidUser);
  btcBalance = balanceBid.get("BTC");
  difBalance = balanceBid.get("DIF");
  assertDecimalEqual(btcBalance.available, "84");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "58");
  assertDecimalEqual(difBalance.frozen, "0");

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
