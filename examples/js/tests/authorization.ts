import { TestUser } from "../config"; // dotenv
import { defaultClient as grpcClient } from "../client";
import { defaultRESTClient as restClient } from "../RESTClient";
import * as assert from "assert";
import axios from "axios";

const GRPC_PERMISSION_DENIED_CODE = 7;
const GRPC_PERMISSION_DENIED_TEXT = "Requires admin role.";
const GRPC_TOKEN_NOT_FOUND_CODE = 16;
const GRPC_TOKEN_NOT_FOUND_TEXT = "Token not found";
const GRPC_INVALID_TOKEN_CODE = 16;
const GRPC_INVALID_TOKEN_TEXT = "InvalidToken";
const GRPC_INVALID_SIGNATURE_CODE = 16;
const GRPC_INVALID_SIGNATURE_TEXT = "InvalidSignature";
const GRPC_TOKEN_EXPIRED_CODE = 16;
const GRPC_TOKEN_EXPIRED_TEXT = "ExpiredSignature";

const HTTP_UNAUTHORIZED_CODE = 401;
const HTTP_UNAUTHORIZED_TEXT = "Unauthorized";

async function grpcPermitAdminAccess() {
  // should be executed without throwing any errors.
  await grpcClient.reloadMarkets(TestUser.ADMIN);
  await grpcClient.debugReset(TestUser.ADMIN);
  await grpcClient.debugReload(TestUser.ADMIN);
  await grpcClient.debugDump(TestUser.ADMIN);
}

async function grpcRejectUserAccessingAdminCalls() {
  try {
    await grpcClient.reloadMarkets(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }

  try {
    await grpcClient.debugReset(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }

  try {
    await grpcClient.debugReload(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }

  try {
    await grpcClient.debugDump(TestUser.USER1);
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }
}

async function grpcRejectUserWithoutToken() {
  try {
    await grpcClient.balanceQueryWithoutJWT();
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }
}

async function grpcRejectUserWithInvalidToken() {
  try {
    await grpcClient.balanceQueryWithInvalidToken();
    throw Error("GRPC call must fail as authentication token is invalid!");
  } catch (e) {
    grpcAssertErrorInvalidToken(e);
  }
}

async function grpcRejectUserWithInvalidSignatureToken() {
  try {
    await grpcClient.balanceQueryWithInvalidSignatureToken();
    throw Error("GRPC call must fail as the authentication token's signature doesn't check out!");
  } catch (e) {
    grpcAssertErrorInvalidTokenSignature(e);
  }
}

async function grpcRejectUserWithEpiredToken() {
  try {
    await grpcClient.balanceQueryWithExpiredToken();
    throw Error("GRPC call must fail as the authentication token is expired!");
  } catch (e) {
    grpcAssertErrorExpiredToken(e);
  }
}

async function restRejectUserWithoutToken() {
  try {
    await restClient.closed_orders("");
    throw Error("REST call must fail as no authentication token is provided!");
  } catch (e) {
    restAssertErrorNoTokenProvided(e);
  }
}

async function restRejectUserWithInvalidToken() {
  try {
    await restClient.closed_orders("LoremIpsum");
    throw Error("REST call must fail as authentication token is invalid!");
  } catch (e) {
    restAssertErrorNoTokenProvided(e);
  }
}

async function restRejectUserWithInvalidToken2() {
  try {
    await restClient.closed_orders("Bearer LoremIpsum");
    throw Error("REST call must fail as authentication token is invalid!");
  } catch (e) {
    restAssertErrorNoTokenProvided(e);
  }
}

async function restRejectUserWithInvalidSignatureToken() {
  try {
    await restClient.closed_orders(process.env.JWT_INVALID_SIGNATURE);
    throw Error("REST call must fail as the authentication token's signature doesn't check out!");
  } catch (e) {
    restAssertErrorNoTokenProvided(e);
  }
}

async function restRejectUserWithEpiredToken() {
  try {
    await restClient.closed_orders(process.env.JWT_EXPIRED);
    throw Error("REST call must fail as the authentication token is expired!");
  } catch (e) {
    restAssertErrorNoTokenProvided(e);
  }
}

function grpcAssertErrorPermissionDenied(error) {
  assert.equal(error.code, GRPC_PERMISSION_DENIED_CODE);
  assert.equal(error.details, GRPC_PERMISSION_DENIED_TEXT);
}

function grpcAssertErrorNoTokenProvided(error) {
  assert.equal(error.code, GRPC_TOKEN_NOT_FOUND_CODE);
  assert.equal(error.details, GRPC_TOKEN_NOT_FOUND_TEXT);
}

function grpcAssertErrorInvalidToken(error) {
  assert.equal(error.code, GRPC_INVALID_TOKEN_CODE);
  assert.equal(error.details, GRPC_INVALID_TOKEN_TEXT);
}

function grpcAssertErrorInvalidTokenSignature(error) {
  assert.equal(error.code, GRPC_INVALID_SIGNATURE_CODE);
  assert.equal(error.details, GRPC_INVALID_SIGNATURE_TEXT);
}

function grpcAssertErrorExpiredToken(error) {
  assert.equal(error.code, GRPC_TOKEN_EXPIRED_CODE);
  assert.equal(error.details, GRPC_TOKEN_EXPIRED_TEXT);
}

function restAssertErrorNoTokenProvided(error) {
  assert.equal(error.response.status, HTTP_UNAUTHORIZED_CODE);
  assert.equal(error.response.statusText, HTTP_UNAUTHORIZED_TEXT);
}

async function main() {
  try {
    console.log("GRPC authentication");
    await grpcPermitAdminAccess();
    await grpcRejectUserAccessingAdminCalls();
    await grpcRejectUserWithoutToken();
    await grpcRejectUserWithInvalidToken();
    await grpcRejectUserWithInvalidSignatureToken();
    await grpcRejectUserWithEpiredToken();
    console.log("REST authentication");
    await restRejectUserWithoutToken();
    await restRejectUserWithInvalidToken();
    await restRejectUserWithInvalidToken2();
    await restRejectUserWithInvalidSignatureToken();
    await restRejectUserWithEpiredToken();

    console.log("Authorization tests successful!");
  } catch (error) {
    // console.error("Caught error:", error);
    process.exit(1);
  }
}

main();
