import axios from "axios";
import { defaultClient as client } from "../client";
import { depositAssets } from "../exchange_helper";
import { fee, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, TestUser } from "../config";
import { strict as assert } from "assert";
import { Authentication } from "../authentication";

const apiServer = process.env.API_ENDPOINT || "0.0.0.0:8765";

async function initClient() {
  await client.connect();
}

async function initAssets() {
  await depositAssets({ BTC: "500000.0" }, TestUser.USER1);
  for (const [name, info] of client.markets) {
    const base = info.base;
    const depositReq = {};
    depositReq[base] = "10";
    await depositAssets(depositReq, TestUser.USER1);
  }
}

async function mainTest() {
  await putOrdersTest();
  await putAndResetOrdersTest();
}

// Put multiple orders
async function putOrdersTest() {
  console.log("putOrdersTest Begin");

  const oldOrderNum1 = await openOrderNum(TestUser.USER1);

  const res = await client.batchOrderPut(TestUser.USER1, market, false, [
    {
      market: market,
      order_side: ORDER_SIDE_BID,
      order_type: ORDER_TYPE_LIMIT,
      amount: "1",
      price: "1",
      taker_fee: fee,
      maker_fee: fee,
    },
    {
      market: market,
      order_side: ORDER_SIDE_BID,
      order_type: ORDER_TYPE_LIMIT,
      amount: "1",
      price: "1",
      taker_fee: fee,
      maker_fee: fee,
    },
  ]);

  const newOrderNum1 = await openOrderNum(TestUser.USER1);
  assert.equal(newOrderNum1 - oldOrderNum1, 2);

  console.log("putOrdersTest End");
}

// Put and reset multiple orders
async function putAndResetOrdersTest() {
  console.log("putAndResetOrdersTest Begin");

  const oldOrderNum1 = await openOrderNum(TestUser.USER1);
  assert(oldOrderNum1 > 0);

  const res = await client.batchOrderPut(TestUser.USER1, market, true, [
    {
      market: market,
      order_side: ORDER_SIDE_BID,
      order_type: ORDER_TYPE_LIMIT,
      amount: "1",
      price: "1",
      taker_fee: fee,
      maker_fee: fee,
    },
    {
      market: market,
      order_side: ORDER_SIDE_BID,
      order_type: ORDER_TYPE_LIMIT,
      amount: "1",
      price: "1",
      taker_fee: fee,
      maker_fee: fee,
    },
  ]);

  const newOrderNum1 = await openOrderNum(TestUser.USER1);
  assert.equal(newOrderNum1, 2);

  console.log("putAndResetOrdersTest End");
}

async function openOrderNum(userId: TestUser) {
  const auth = new Authentication();
  axios.defaults.headers.common["Authorization"] = await auth.getAuthTokenMetaValue(userId);
  return (await axios.get(`http://${apiServer}/api/exchange/action/orders/${market}`)).data.orders.length;
}

async function main() {
  try {
    await initClient();
    await client.debugReset(await client.auth.getAuthTokenMeta(TestUser.ADMIN));
    await initAssets();
    await mainTest();
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}

main();
