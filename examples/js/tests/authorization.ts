import { TestUser } from "../config"; // dotenv
import { defaultClient as grpcClient } from "../client";
import { defaultRESTClient as restClient } from "../RESTClient";
import * as assert from "assert";
import { Authentication } from "../authentication";

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

async function grpcRejectUserWithExpiredToken() {
  try {
    await grpcClient.balanceQueryWithExpiredToken();
    throw Error("GRPC call must fail as the authentication token is expired!");
  } catch (e) {
    grpcAssertErrorExpiredToken(e);
  }
}

async function restRejectUserWithoutToken() {
  try {
    await restClient.closedOrders("", "ETH_USDT");
    throw Error("REST call must fail as no authentication token is provided!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithInvalidToken() {
  try {
    await restClient.closedOrders("LoremIpsum", "ETH_USDT");
    throw Error("REST call must fail as authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithInvalidToken2() {
  try {
    await restClient.closedOrders("Bearer LoremIpsum", "ETH_USDT");
    throw Error("REST call must fail as authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithInvalidSignatureToken() {
  try {
    await restClient.closedOrders(process.env.JWT_INVALID_SIGNATURE, "ETH_USDT");
    throw Error("REST call must fail as the authentication token's signature doesn't check out!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithExpiredToken() {
  try {
    await restClient.closedOrders(process.env.JWT_EXPIRED, "ETH_USDT");
    throw Error("REST call must fail as the authentication token is expired!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restPermitAccessWithValidToken(auth: Authentication) {
  await restClient.closedOrders(await auth.getAuthTokenMetaValue(TestUser.USER1), "ETH_USDT");
}

async function restTestPublicEndpoints(auth: Authentication) {
  // should work without authentication ...
  await restClient.ping("Bearer LoremIpsum");
  await restClient.recentTrades("Bearer LoremIpsum", "ETH_USDT");
  await restClient.orderTrades("Bearer LoremIpsum", "ETH_USDT", 2);
  await restClient.ticker("Bearer LoremIpsum", "24h", "ETH_USDT");
  await restClient.tradingView("Bearer LoremIpsum");

  // ... as well as with authentication
  await restClient.ping(await auth.getAuthTokenMetaValue(TestUser.USER1));
  await restClient.recentTrades(await auth.getAuthTokenMetaValue(TestUser.USER1), "ETH_USDT");
  await restClient.orderTrades(await auth.getAuthTokenMetaValue(TestUser.USER1), "ETH_USDT", 2);
  await restClient.ticker(await auth.getAuthTokenMetaValue(TestUser.USER1), "24h", "ETH_USDT");
  await restClient.tradingView(await auth.getAuthTokenMetaValue(TestUser.USER1));
}

async function restTestRegularEndpoints(auth: Authentication) {
  // should work with authentication ...
  await restClient.authping(await auth.getAuthTokenMetaValue(TestUser.USER1));
  await restClient.closedOrders(await auth.getAuthTokenMetaValue(TestUser.USER1), "ETH_USDT");

  // ... but not without
  try {
    await restClient.authping("Bearer LoremIpsum");
    throw Error("REST call must fail as the authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
  try {
    await restClient.closedOrders("Bearer LoremIpsum", "ETH_USDT");
    throw Error("REST call must fail as the authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function testAdminEndpoints(auth: Authentication) {
  let newAssetName = getRandomString(4);
  let new_asset = {
    assets: [{ id: newAssetName, symbol: newAssetName, name: newAssetName, prec_save: 4, prec_show: 4 }],
    not_reload: false,
    jwt: await auth.getAdminAuthToken(),
  };

  // must not work without authentication ...
  try {
    await restClient.manage_reload("Bearer LoremIpsum");
    throw Error("REST call must fail as it requires admin permissions");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
  try {
    await restClient.manage_assets("Bearer LoremIpsum", new_asset);
    throw Error("REST call must fail as the authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
  // todo fix this test: (check https://github.com/fluidex/dingir-exchange/issues/371)
  // try {
  //   await restClient.manage_traid_pairs("Bearer LoremIpsum", new_market);
  //   throw Error("REST call must fail as the authentication token is invalid!");
  // } catch (e) {
  //   restAssertAuthenticationNotSatisfactory(e);
  // }

  // ... and neither without admin permissions
  try {
    await restClient.manage_reload(await auth.getAuthTokenMetaValue(TestUser.USER1));
    throw Error("REST call must fail as it requires admin permissions");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
  try {
    await restClient.manage_assets(await auth.getAuthTokenMetaValue(TestUser.USER1), new_asset);
    throw Error("REST call must fail as it requires admin permissions");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
  // todo fix this test: (check https://github.com/fluidex/dingir-exchange/issues/371)
  // try {
  //   await restClient.manage_traid_pairs(await auth.getAuthTokenMetaValue(TestUser.USER1), new_market);
  //   throw Error("REST call must fail as it requires admin permissions");
  // } catch (e) {
  //   restAssertAuthenticationNotSatisfactory(e);
  // }

  // ... but should work with admin permissions
  await restClient.manage_reload(await auth.getAuthTokenMetaValue(TestUser.ADMIN));
  await restClient.manage_assets(await auth.getAuthTokenMetaValue(TestUser.ADMIN), new_asset);
  // todo fix this test: (check https://github.com/fluidex/dingir-exchange/issues/371)
  // await restClient.manage_traid_pairs(await auth.getAuthTokenMetaValue(TestUser.ADMIN), new_market);
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

function restAssertAuthenticationNotSatisfactory(error) {
  assert.equal(error.response.status, HTTP_UNAUTHORIZED_CODE);
  assert.equal(error.response.statusText, HTTP_UNAUTHORIZED_TEXT);
}

async function main() {
  let auth = new Authentication();

  try {
    console.log("GRPC authentication");
    await grpcPermitAdminAccess();
    await grpcRejectUserAccessingAdminCalls();
    await grpcRejectUserWithoutToken();
    await grpcRejectUserWithInvalidToken();
    await grpcRejectUserWithInvalidSignatureToken();
    await grpcRejectUserWithExpiredToken();
    console.log("REST authentication");
    await restRejectUserWithoutToken();
    await restRejectUserWithInvalidToken();
    await restRejectUserWithInvalidToken2();
    await restRejectUserWithInvalidSignatureToken();
    await restRejectUserWithExpiredToken();
    await restPermitAccessWithValidToken(auth);
    await restTestPublicEndpoints(auth);
    await restTestRegularEndpoints(auth);
    await testAdminEndpoints(auth);

    console.log("Authorization tests successful!");
  } catch (error) {
    console.error("Caught error:", error);
    process.exit(1);
  }
}

function getRandomString(length: number) {
  let randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  return result;
}

main();
