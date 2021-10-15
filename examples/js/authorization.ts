import { TestUser } from "./config"; // dotenv
import { defaultClient as client } from "./client";
import * as assert from "assert";

const PERMISSION_DENIED_CODE = 7;
const PERMISSION_DENIED_TEXT = "Requires admin role.";
const TOKEN_NOT_FOUND_CODE = 16;
const TOKEN_NOT_FOUND_TEXT = "Token not found";
const INVALID_TOKEN_CODE = 16;
const INVALID_TOKEN_TEXT = "InvalidToken";
const INVALID_SIGNATURE_CODE = 16;
const INVALID_SIGNATURE_TEXT = "InvalidSignature";
const TOKEN_EXPIRED_CODE = 16;
const TOKEN_EXPIRED_TEXT = "ExpiredSignature";

async function permitAdminAccess() {
  // should be executed without throwing any errors.
  await client.reloadMarkets(TestUser.ADMIN);
  await client.debugReset(TestUser.ADMIN);
  await client.debugReload(TestUser.ADMIN);
  await client.debugDump(TestUser.ADMIN);
}

async function rejectUserAccessingAdminCalls() {
  try {
    await client.reloadMarkets(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    assertErrorPermissionDenied(e);
  }

  try {
    await client.debugReset(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    assertErrorPermissionDenied(e);
  }

  try {
    await client.debugReload(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    assertErrorPermissionDenied(e);
  }

  try {
    await client.debugDump(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    assertErrorPermissionDenied(e);
  }
}

async function rejectUserWithoutToken() {
  try {
    await client.balanceQueryWithoutJWT();
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    assertErrorNoTokenProvided(e);
  }
}

async function rejectUserWithInvalidToken() {
  try {
    await client.balanceQueryWithInvalidToken();
    throw Error("GRPC call must fail as authentication token is invalid!");
  } catch (e) {
    assertErrorInvalidToken(e);
  }
}

async function rejectUserWithInvalidSignatureToken() {
  try {
    await client.balanceQueryWithInvalidSignatureToken();
    throw Error("GRPC call must fail as the authentication token's signature doesn't check out!");
  } catch (e) {
    assertErrorInvalidTokenSignature(e);
  }
}

async function rejectUserWithEpiredToken() {
  try {
    await client.balanceQueryWithExpiredToken();
    throw Error("GRPC call must fail as the authentication token's signature doesn't check out!");
  } catch (e) {
    assertErrorExpiredToken(e);
  }
}

function assertErrorPermissionDenied(error) {
  assert.equal(error.code, PERMISSION_DENIED_CODE);
  assert.equal(error.details, PERMISSION_DENIED_TEXT);
}

function assertErrorNoTokenProvided(error) {
  assert.equal(error.code, TOKEN_NOT_FOUND_CODE);
  assert.equal(error.details, TOKEN_NOT_FOUND_TEXT);
}

function assertErrorInvalidToken(error) {
  assert.equal(error.code, INVALID_TOKEN_CODE);
  assert.equal(error.details, INVALID_TOKEN_TEXT);
}

function assertErrorInvalidTokenSignature(error) {
  assert.equal(error.code, INVALID_SIGNATURE_CODE);
  assert.equal(error.details, INVALID_SIGNATURE_TEXT);
}

function assertErrorExpiredToken(error) {
  assert.equal(error.code, TOKEN_EXPIRED_CODE);
  assert.equal(error.details, TOKEN_EXPIRED_TEXT);
}

async function main() {
  try {
    await permitAdminAccess();
    await rejectUserAccessingAdminCalls();
    await rejectUserWithoutToken();
    await rejectUserWithInvalidToken();
    await rejectUserWithInvalidSignatureToken();
    await rejectUserWithEpiredToken();
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}

main();
