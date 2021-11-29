import { TestUser } from "../config"; // dotenv
import { defaultClient as client } from "../client";
import { defaultRESTClient as rest_client } from "../RESTClient";
import { assertDecimalEqual, sleep } from "../util";

import { strict as assert } from "assert";
import { depositAssets } from "../exchange_helper";

async function setupAsset() {
  await depositAssets({ ETH: "100.0" }, TestUser.USER1);

  const balance1 = await client.balanceQueryByAsset(TestUser.USER1, "ETH");
  assertDecimalEqual(balance1.available, "100");
  const balance2 = await client.balanceQueryByAsset(TestUser.USER2, "ETH");
  assertDecimalEqual(balance2.available, "0");
}

// Test failure with argument delta of value zero
async function failureWithZeroDeltaTest() {
  const res = await client.transfer(TestUser.USER1, TestUser.USER2, "ETH", 0);

  assert.equal(res.success, false);
  assert.equal(res.asset, "ETH");
  assertDecimalEqual(res.balance_from, "100");

  const balance1 = await client.balanceQueryByAsset(TestUser.USER1, "ETH");
  assertDecimalEqual(balance1.available, "100");
  const balance2 = await client.balanceQueryByAsset(TestUser.USER2, "ETH");
  assertDecimalEqual(balance2.available, "0");

  console.log("failureWithZeroDeltaTest passed");
}

// Test failure with insufficient balance of from user
async function failureWithInsufficientFromBalanceTest() {
  const res = await client.transfer(TestUser.USER1, TestUser.USER2, "ETH", 101);

  assert.equal(res.success, false);
  assert.equal(res.asset, "ETH");
  assertDecimalEqual(res.balance_from, "100");

  const balance1 = await client.balanceQueryByAsset(TestUser.USER1, "ETH");
  assertDecimalEqual(balance1.available, "100");
  const balance2 = await client.balanceQueryByAsset(TestUser.USER2, "ETH");
  assertDecimalEqual(balance2.available, "0");

  console.log("failureWithInsufficientFromBalanceTest passed");
}

// Test success transfer
async function successTransferTest() {
  const res = await client.transfer(TestUser.USER1, TestUser.USER2, "ETH", 50);

  assert.equal(res.success, true);
  assert.equal(res.asset, "ETH");
  assertDecimalEqual(res.balance_from, "50");

  const balance1 = await client.balanceQueryByAsset(TestUser.USER1, "ETH");
  assertDecimalEqual(balance1.available, "50");
  const balance2 = await client.balanceQueryByAsset(TestUser.USER2, "ETH");
  assertDecimalEqual(balance2.available, "50");

  console.log("successTransferTest passed");
}

async function listTxs() {
  const res1 = (await rest_client.internal_txs(TestUser.USER1))[0];
  const res2 = (await rest_client.internal_txs(TestUser.USER2))[0];
  console.log(res1, res2);
  assert.equal(res1.amount, res2.amount);
  assert.equal(res1.asset, res2.asset);
  assert.equal(res1.time, res2.time);
  assert.equal(res1.user_from, res2.user_from);
  assert.equal(res1.user_to, res2.user_to);
}

async function simpleTest() {
  await setupAsset();
  await failureWithZeroDeltaTest();
  await failureWithInsufficientFromBalanceTest();
  await successTransferTest();
  await sleep(3 * 1000);
  await listTxs();
}

async function mainTest() {
  await client.debugReset(1);
  await simpleTest();
}

async function main() {
  try {
    await mainTest();
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}
main();
