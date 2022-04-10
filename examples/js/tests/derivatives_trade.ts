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

// Test order trading
async function tradeTest() {
  // Here's the trade scenario we are going to test:
  // The table always describes the situation *after* an order has been placed (and potentially filled).
  // The information containing slashes (/) must be understood like this: owned/order-book
  //
  //               |  Order 1    | Order 2         | Order 3           | Order 4           | Order 5           |
  // ==============|=============|=================|===================|===================|===================|
  // User 1        | - / 4 short | 4 short / -     | 4 short / -       | 2 short / 3 long  | 1 long / -        |
  // --------------|-------------|-----------------|-------------------|-------------------|-------------------|
  // User 2        | - / -       | 4 long / 6 long | 10 long / -       | 10 long / -       | 7 long / 7 short  |
  // --------------|-------------|-----------------|-------------------|-------------------|-------------------|
  // User 3        | - / -       | - / -           | 6 short / 2 short | 8 short / -       | 8 short / -       |
  // ==============|=============|=================|===================|===================|===================|
  // Volume        | 0 contracts | 4 contracts     | 10 contracts      | 12 contracts      | 15 contracts      |
  // Open Interest | 0 positions | 4 positions     | 10 positions      | 10 positions      | 8 positions       |

  // Increase Open Interest
  const askOrder = await client.orderPut(askUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "4", /*price*/ "1.1", fee, fee);
  const bidOrder = await client.orderPut(bidUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "10", /*price*/ "1.1", fee, fee);
  console.log("ask order id", askOrder.id);
  console.log("bid order id", bidOrder.id);
  await testStatusAfterTrade1(askOrder.id, bidOrder.id);
  const askOrder2 = await client.orderPut(askUser2, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "8", /*price*/ "1.1", fee, fee);
  console.log("ask order 2 id", askOrder2.id);
  await testStatusAfterTrades2(askOrder.id, bidOrder.id, askOrder2.id);

  // Open Interest stays the same ...
  // closes 4 short positions and opens 1 long position [ but only closing 2 shorts positions is what gets filled ]
  const bidOrder2 = await client.orderPut(askUser, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, /*amount*/ "5", /*price*/ "1.1", fee, fee);

  // Decrease Open Interest
  // closes 10 long positions (7 of which will stay in order book)
  const askOrder3 = await client.orderPut(bidUser, market, ORDER_SIDE_ASK, ORDER_TYPE_LIMIT, /*amount*/ "10", /*price*/ "1.1", fee, fee);
  await testStatusAfterTrades3(askOrder.id, bidOrder.id, askOrder2.id, bidOrder2.id, askOrder3.id);

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
  assertDecimalEqual(summary.volume, 4);
  assertDecimalEqual(summary.open_interest, 4);

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

async function testStatusAfterTrades2(askOrderId, bidOrderId, askOrder2Id) {
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
  assertDecimalEqual(summary.volume, 10);
  assertDecimalEqual(summary.open_interest, 10);

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

async function testStatusAfterTrades3(askOrderId, bidOrderId, askOrder2Id, bidOrder2Id, askOrder3Id) {
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
  assertDecimalEqual(summary.volume, 15);
  assertDecimalEqual(summary.open_interest, 8);

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
  return await tradeTest();
}

function checkMessages(messages) {
  // TODO: more careful check
  assert.equal(messages.get("orders").length, 9);
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
