import { TestUser, base, quote, market, fee, ORDER_SIDE_BID, ORDER_SIDE_ASK, ORDER_TYPE_MARKET, ORDER_TYPE_LIMIT } from "../config"; // dotenv
import { defaultClient as client } from "../client";
import { sleep, assertDecimalEqual } from "../util";
import { depositAssets } from "../exchange_helper";
import { KafkaConsumer } from "../kafka_client";

import Decimal from "decimal.js";
import { strict as assert } from "assert";
import whynoderun from "why-is-node-running";

const depositAdmin = TestUser.DEPOSIT_ADMIN;
const askUser = TestUser.USER1;
const askUserId = process.env.KC_USER1_ID;
const bidUser = TestUser.USER2;
const askUser2 = TestUser.WITHDRAWAL_ADMIN; // could be a regular user, but I'm lazy

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

  await depositAssets({ BTC: "100.0" }, askUserId, depositAdmin);

  // check deposit success
  const balance2 = await client.balanceQuery(askUser);
  btcBalance = balance2.get("BTC");
  difBalance = balance2.get("DIF");
  console.log(btcBalance);
  assertDecimalEqual(btcBalance.available, "100");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "0");
  assertDecimalEqual(difBalance.frozen, "0");
}

// Test order put and cancel
async function orderTest() {
  const order = await client.orderPut(askUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "10", /*price*/ "1.1", fee, fee);
  console.log(order);
  const balance3 = await client.balanceQueryByAsset(askUser, "BTC");
  assertDecimalEqual(balance3.available, "89");
  assertDecimalEqual(balance3.frozen, "11");

  const orderPending = await client.orderDetail({}, market, order.id);
  assert.deepEqual(orderPending, order);

  const summary = await client.marketSummary({}, market);
  assertDecimalEqual(summary.bid_amount, "10");
  assert.equal(summary.bid_count, 1);

  const depth = await client.orderDepth({}, market, 100, /*not merge*/ "0");
  assert.deepEqual(depth, {
    asks: [],
    bids: [{ price: "1.10", amount: "10.0000" }],
  });

  await client.orderCancel(askUser, market, 1);
  const balance4 = await client.balanceQueryByAsset(askUser, "BTC");
  assertDecimalEqual(balance4.available, "100");
  assertDecimalEqual(balance4.frozen, "0");

  console.log("derivatives orderTest passed");
}

// Test order trading
async function tradeTest() {
  // Increase Open Interest
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "1.1", fee, fee);
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "10", /*price*/ "1.1", fee, fee);
  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);
  await testStatusAfterTrade1(askOrder.id, bidOrder.id);
  const askOrder2 = await client.orderPut(askUser2, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "8", /*price*/ "1.1", fee, fee);
  console.log("ask order 2 id", askOrder2.id);
  await testStatusAfterTrade2(askOrder.id, bidOrder.id, askOrder2.id);

  // Decrease Open Interest
  // closes 4 long positions and opens 1 short position
  const bidOrder2 = await client.orderPut(askUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "5", /*price*/ "1.1", fee, fee);
  // closes 10 short positions (7 of which will stay in order book)
  const askOrder3 = await client.orderPut(bidUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "10", /*price*/ "1.1", fee, fee);
  await testStatusAfterTrade3(askOrder.id, bidOrder.id, askOrder2.id, bidOrder2.id, askOrder3.id);

  console.log("derivatives tradeTest passed!");
  return [askOrder.id, bidOrder.id, askOrder2.id, bidOrder2.id, askOrder3.id];
}

async function testStatusAfterTrade1(askOrderId, bidOrderId) {
  const bidOrderPending = await client.orderDetail({}, market, bidOrderId);
  assertDecimalEqual(bidOrderPending.remain, "6");

  // Now, the `askOrder` will be matched and traded
  // So it will not be kept by the match engine
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail({}, market, askOrderId);
    console.log(askOrderPending);
  }, /invalid order_id/);

  const summary = await client.marketSummary({}, market);
  assertDecimalEqual(summary.bid_amount, "6");
  assert.equal(summary.bid_count, 1);

  // 4 * 1.1 sell, filled 4
  const balance1 = await client.balanceQuery(askUser);
  let btcBalance = balance1.get("BTC");
  let difBalance = balance1.get("DIF");
  assertDecimalEqual(btcBalance.available, "104.4");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(+btcBalance.available + +btcBalance.frozen, "104.4"); // What the user holds in total
  assertDecimalEqual(difBalance.available, "-4");
  assertDecimalEqual(difBalance.frozen, "0");
  assertDecimalEqual(+difBalance.available + +difBalance.frozen, "-4"); // What the user holds in total
  // 10 * 1.1 buy, filled 4
  const balance2 = await client.balanceQuery(bidUser);
  btcBalance = balance2.get("BTC");
  difBalance = balance2.get("DIF");
  assertDecimalEqual(btcBalance.available, "-11");
  assertDecimalEqual(btcBalance.frozen, "6.6");
  assertDecimalEqual(+btcBalance.available + +btcBalance.frozen, "-4.4"); // What the user holds in total
  assertDecimalEqual(difBalance.available, "4");
  assertDecimalEqual(difBalance.frozen, "0");
  assertDecimalEqual(+difBalance.available + +difBalance.frozen, "4"); // What the user holds in total
}

async function testStatusAfterTrade2(askOrderId, bidOrderId, askOrder2Id) {
  const askOrderPending = await client.orderDetail({}, market, askOrder2Id);
  assertDecimalEqual(askOrderPending.remain, "2");

  // Now, the `askOrder` and the `bidOrder` will be matched and traded
  // So it will not be kept by the match engine
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail({}, market, askOrderId);
    console.log(askOrderPending);
  }, /invalid order_id/);
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail({}, market, bidOrderId);
    console.log(askOrderPending);
  }, /invalid order_id/);

  const summary = await client.marketSummary({}, market);
  assertDecimalEqual(summary.ask_amount, "2");
  assert.equal(summary.ask_count, 1);

  // 4 * 1.1 sell, filled 4
  const balance1 = await client.balanceQuery(askUser);
  let btcBalance = balance1.get("BTC");
  let difBalance = balance1.get("DIF");
  assertDecimalEqual(btcBalance.available, "104.4");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "-4");
  assertDecimalEqual(difBalance.frozen, "0");
  // 10 * 1.1 buy, filled 4
  const balance2 = await client.balanceQuery(bidUser);
  btcBalance = balance2.get("BTC");
  difBalance = balance2.get("DIF");
  assertDecimalEqual(btcBalance.available, "-11");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "10");
  assertDecimalEqual(difBalance.frozen, "0");

  const balance3 = await client.balanceQuery(askUser2);
  btcBalance = balance3.get("BTC");
  difBalance = balance3.get("DIF");
  assertDecimalEqual(btcBalance.available, "6.6");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(+btcBalance.available + +btcBalance.frozen, "6.6"); // What the user holds in total

  assertDecimalEqual(difBalance.available, "-8");
  assertDecimalEqual(difBalance.frozen, "2");
  assertDecimalEqual(+difBalance.available + +difBalance.frozen, "-6"); // What the user holds in total
  // ^ explanation:
  // The user wants to sell 8 contracts, but holds 0. 6 get matched, so the user essentially owns -6 contracts.
  // So in order to see what the user really holds at any given time, you always have to sum up available balances and frozen balances.
}

async function testStatusAfterTrade3(askOrderId, bidOrderId, askOrder2Id, bidOrder2Id, askOrder3Id) {
  const askOrderPending = await client.orderDetail({}, market, askOrder3Id);
  assertDecimalEqual(askOrderPending.remain, "7");

  // Now, the `askOrder` and the `bidOrder` will be matched and traded
  // So it will not be kept by the match engine
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail({}, market, askOrderId);
    console.log(askOrderPending);
  }, /invalid order_id/);
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail({}, market, bidOrderId);
    console.log(askOrderPending);
  }, /invalid order_id/);
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail({}, market, askOrder2Id);
    console.log(askOrderPending);
  }, /invalid order_id/);
  await assert.rejects(async () => {
    const askOrderPending = await client.orderDetail({}, market, bidOrder2Id);
    console.log(askOrderPending);
  }, /invalid order_id/);

  const summary = await client.marketSummary({}, market);
  assertDecimalEqual(summary.ask_amount, "7");
  assert.equal(summary.ask_count, 1);

  // 4 * 1.1 sell, filled 4
  const balance1 = await client.balanceQuery(askUser);
  let btcBalance = balance1.get("BTC");
  let difBalance = balance1.get("DIF");
  assertDecimalEqual(btcBalance.available, "98.9");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "1");
  assertDecimalEqual(difBalance.frozen, "0");
  // 10 * 1.1 buy, filled 4
  const balance2 = await client.balanceQuery(bidUser);
  btcBalance = balance2.get("BTC");
  difBalance = balance2.get("DIF");
  assertDecimalEqual(btcBalance.available, "-7.7");
  assertDecimalEqual(btcBalance.frozen, "0");
  assertDecimalEqual(difBalance.available, "0");
  assertDecimalEqual(difBalance.frozen, "7");

  const balance3 = await client.balanceQuery(askUser2);
  btcBalance = balance3.get("BTC");
  difBalance = balance3.get("DIF");
  assertDecimalEqual(btcBalance.available, "8.8");
  assertDecimalEqual(btcBalance.frozen, "0");

  assertDecimalEqual(difBalance.available, "-8");
  assertDecimalEqual(difBalance.frozen, "0");
}

async function simpleTest() {
  await setupAsset();
  await orderTest();
  return await tradeTest();
}

function checkMessages(messages) {
  // TODO: more careful check
  assert.equal(messages.get("orders").length, 11);
  assert.equal(messages.get("balances").length, 17);
  assert.equal(messages.get("trades").length, 4);
}

async function mainTest(withMQ) {
  await client.debugReset(await client.auth.getAuthTokenMeta(TestUser.ADMIN));

  let kafkaConsumer: KafkaConsumer;
  if (withMQ) {
    kafkaConsumer = new KafkaConsumer();
    kafkaConsumer.Init();
  }
  const [askOrderId, bidOrderId, askOrder2Id, bidOrder2Id, askOrder3Id] = await simpleTest();
  if (withMQ) {
    await sleep(3 * 1000);
    const messages = kafkaConsumer.GetAllMessages();
    console.log(messages);
    await kafkaConsumer.Stop();
    checkMessages(messages);
  }
}

async function main() {
  try {
    await mainTest(!!process.env.TEST_MQ || false);
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}
main();
