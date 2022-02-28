import { fee, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, TestUser } from "../config"; // dotenv
import { defaultClient as grpcClient } from "../client";
import { defaultRESTClient as restClient } from "../RESTClient";
import * as assert from "assert";
import { Authentication } from "../authentication";
import { depositAssets } from "../exchange_helper";

const GRPC_PERMISSION_DENIED_CODE = 7;
const GRPC_PERMISSION_DENIED_TEXT = "Requires admin role.";
const GRPC_DEPOSIT_PERMISSION_DENIED_TEXT = "Requires deposit-admin role.";
const GRPC_WITHDRAWAL_PERMISSION_DENIED_TEXT = "Requires withdrawal-admin role.";
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

const NON_EXISTANT_USER = 123456789;

async function grpcPermitAdminAccess() {
  // should be executed without throwing any errors.
  await grpcClient.reloadMarkets(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN));
  await grpcClient.debugReset(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN));
  await grpcClient.debugReload(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN));
  await grpcClient.debugDump(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN));
}

async function grpcRejectUserAccessingAdminCalls() {
  try {
    await grpcClient.reloadMarkets(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1));
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }

  try {
    await grpcClient.debugReset(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1));
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }

  try {
    await grpcClient.debugReload(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1));
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }

  try {
    await grpcClient.debugDump(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1));
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorPermissionDenied(e);
  }
}

async function grpcRejectAnonymousAccessingAdminCalls() {
  try {
    await grpcClient.reloadMarkets({});
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await grpcClient.debugReset({});
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await grpcClient.debugReload({});
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await grpcClient.debugDump({});
    throw Error("Non-admin must not be able to call Admin Remote Procedures!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }
}

async function grpcRejectUserWithoutToken() {
  try {
    await grpcClient.balanceQueryWithoutJWT();
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await grpcClient.orderCancelAll(NON_EXISTANT_USER, market);
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await depositAssets({ BTC: "100.0", DIF: "50.0" }, process.env.KC_USER1_ID, NON_EXISTANT_USER);
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await grpcClient.orderPut(NON_EXISTANT_USER, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, "10", "1.1", fee, fee);
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await batchOrderPut(NON_EXISTANT_USER);
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await grpcClient.orderCancel(NON_EXISTANT_USER, market, 2);
    throw Error("GRPC call must fail as no authentication token is provided!");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }

  try {
    await await grpcClient.orderQuery(NON_EXISTANT_USER, market);
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

async function grpcPermitAccessToRegularUser() {
  await grpcClient.balanceQueryWithValidToken();
  await grpcClient.orderCancelAll(TestUser.USER1, market);

  // === SETTING UP MARKET DATA THAT IS LATER BEING USED FOR orderDetail TESTS. === //
  await depositAssets({ BTC: "100.0", DIF: "50.0" }, process.env.KC_USER1_ID, TestUser.DEPOSIT_ADMIN);
  await grpcClient.orderPut(TestUser.USER1, market, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, "10", "1.1", fee, fee);
  await batchOrderPut(TestUser.USER1);

  await grpcClient.orderCancel(TestUser.USER1, market, 2);
  await grpcClient.orderQuery(TestUser.USER1, market);
}

async function grpcTestDepositAccess() {
  // Deposit should begranted to the deposit admin user.
  await depositAssets({ BTC: "100.0", DIF: "50.0" }, process.env.KC_USER1_ID, TestUser.DEPOSIT_ADMIN);

  try {
    await depositAssets({ BTC: "100.0", DIF: "50.0" }, process.env.KC_USER1_ID, TestUser.ADMIN);
    throw Error("Admin must not be able to deposit funds");
  } catch (e) {
    grpcAssertErrorDepositPermissionDenied(e);
  }

  try {
    await depositAssets({ BTC: "100.0", DIF: "50.0" }, process.env.KC_USER1_ID, TestUser.WITHDRAWAL_ADMIN);
    throw Error("Withdrawal Admin must not be able to deposit funds");
  } catch (e) {
    grpcAssertErrorDepositPermissionDenied(e);
  }

  try {
    await depositAssets({ BTC: "100.0", DIF: "50.0" }, process.env.KC_USER1_ID, TestUser.USER1);
    throw Error("Regular user must not be able to deposit funds");
  } catch (e) {
    grpcAssertErrorDepositPermissionDenied(e);
  }

  try {
    await depositAssets({ BTC: "100.0", DIF: "50.0" }, process.env.KC_USER1_ID, null);
    throw Error("Anonymous must not be able to deposit funds");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }
}

async function grpcTestWithdrawalAccess() {
  // Deposit should begranted to the withdrawal admin user.
  await depositAssets({ BTC: "-100.0", DIF: "-50.0" }, process.env.KC_USER1_ID, TestUser.WITHDRAWAL_ADMIN);

  try {
    await depositAssets({ BTC: "-100.0", DIF: "-50.0" }, process.env.KC_USER1_ID, TestUser.ADMIN);
    throw Error("Admin must not be able to withdraw funds");
  } catch (e) {
    grpcAssertErrorWithdrawalPermissionDenied(e);
  }

  try {
    await depositAssets({ BTC: "-100.0", DIF: "-50.0" }, process.env.KC_USER1_ID, TestUser.DEPOSIT_ADMIN);
    throw Error("Deposit Admin must not be able to withdraw funds");
  } catch (e) {
    grpcAssertErrorWithdrawalPermissionDenied(e);
  }

  try {
    await depositAssets({ BTC: "-100.0", DIF: "-50.0" }, process.env.KC_USER1_ID, TestUser.USER1);
    throw Error("Regular user must not be able to withdraw funds");
  } catch (e) {
    grpcAssertErrorWithdrawalPermissionDenied(e);
  }

  try {
    await depositAssets({ BTC: "-100.0", DIF: "-50.0" }, process.env.KC_USER1_ID, null);
    throw Error("Anonymous must not be able to withdraw funds");
  } catch (e) {
    grpcAssertErrorNoTokenProvided(e);
  }
}

async function grpcTestPublicEndpoints() {
  // should work without authentication ...
  await grpcClient.assetList({});
  await grpcClient.marketList({});
  await grpcClient.marketSummary({}, market);
  await grpcClient.orderDetail({}, market, 1);
  await grpcClient.orderDepth({}, market, 20, "0.01");

  // ... as well as with authentication
  await grpcClient.assetList(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1));
  await grpcClient.marketList(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1));
  await grpcClient.marketSummary(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1), market);
  await grpcClient.orderDetail(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1), market, 1);
  await grpcClient.orderDepth(await grpcClient.auth.getAuthTokenMeta(TestUser.USER1), market, 20, "0.01");

  // ... including admin users
  await grpcClient.assetList(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN));
  await grpcClient.marketList(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN));
  await grpcClient.marketSummary(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN), market);
  await grpcClient.orderDetail(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN), market, 1);
  await grpcClient.orderDepth(await grpcClient.auth.getAuthTokenMeta(TestUser.ADMIN), market, 20, "0.01");
}

async function batchOrderPut(user) {
  await grpcClient.batchOrderPut(user, market, false, [
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
}

async function restRejectUserWithoutToken() {
  try {
    await restClient.closedOrders("", market);
    throw Error("REST call must fail as no authentication token is provided!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithInvalidToken() {
  try {
    await restClient.closedOrders("LoremIpsum", market);
    throw Error("REST call must fail as authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithInvalidToken2() {
  try {
    await restClient.closedOrders("Bearer LoremIpsum", market);
    throw Error("REST call must fail as authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithInvalidSignatureToken() {
  try {
    await restClient.closedOrders(process.env.JWT_INVALID_SIGNATURE, market);
    throw Error("REST call must fail as the authentication token's signature doesn't check out!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restRejectUserWithExpiredToken() {
  try {
    await restClient.closedOrders(process.env.JWT_EXPIRED, market);
    throw Error("REST call must fail as the authentication token is expired!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
}

async function restPermitAccessWithValidToken(auth: Authentication) {
  await restClient.closedOrders(await auth.getAuthTokenMetaValue(TestUser.USER1), market);
}

async function restTestPublicEndpoints(auth: Authentication) {
  // should work without authentication ...
  await restClient.ping("Bearer LoremIpsum");
  await restClient.recentTrades("Bearer LoremIpsum", market);
  await restClient.orderTrades("Bearer LoremIpsum", market, 2);
  await restClient.ticker("Bearer LoremIpsum", "24h", market);
  await restClient.tradingView("Bearer LoremIpsum");

  // ... as well as with authentication
  await restClient.ping(await auth.getAuthTokenMetaValue(TestUser.USER1));
  await restClient.recentTrades(await auth.getAuthTokenMetaValue(TestUser.USER1), market);
  await restClient.orderTrades(await auth.getAuthTokenMetaValue(TestUser.USER1), market, 2);
  await restClient.ticker(await auth.getAuthTokenMetaValue(TestUser.USER1), "24h", market);
  await restClient.tradingView(await auth.getAuthTokenMetaValue(TestUser.USER1));
}

async function restTestRegularEndpoints(auth: Authentication) {
  // should work with authentication ...
  await restClient.authping(await auth.getAuthTokenMetaValue(TestUser.USER1));
  await restClient.closedOrders(await auth.getAuthTokenMetaValue(TestUser.USER1), market);

  // ... but not without
  try {
    await restClient.authping("Bearer LoremIpsum");
    throw Error("REST call must fail as the authentication token is invalid!");
  } catch (e) {
    restAssertAuthenticationNotSatisfactory(e);
  }
  try {
    await restClient.closedOrders("Bearer LoremIpsum", market);
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
    jwt: await auth.getAuthTokenMetaValue(TestUser.ADMIN),
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

function grpcAssertErrorDepositPermissionDenied(error) {
  assert.equal(error.code, GRPC_PERMISSION_DENIED_CODE);
  assert.equal(error.details, GRPC_DEPOSIT_PERMISSION_DENIED_TEXT);
}

function grpcAssertErrorWithdrawalPermissionDenied(error) {
  assert.equal(error.code, GRPC_PERMISSION_DENIED_CODE);
  assert.equal(error.details, GRPC_WITHDRAWAL_PERMISSION_DENIED_TEXT);
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
  // disable logging
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = () => {};

  let auth = new Authentication();

  try {
    console.info("GRPC authentication");
    await grpcPermitAdminAccess();
    await grpcRejectUserAccessingAdminCalls();
    await grpcRejectAnonymousAccessingAdminCalls();
    await grpcRejectUserWithoutToken();
    await grpcRejectUserWithInvalidToken();
    await grpcRejectUserWithInvalidSignatureToken();
    await grpcRejectUserWithExpiredToken();
    await grpcPermitAccessToRegularUser();
    await grpcTestDepositAccess();
    await grpcTestWithdrawalAccess();
    await grpcTestPublicEndpoints();
    console.info("REST authentication");
    await restRejectUserWithoutToken();
    await restRejectUserWithInvalidToken();
    await restRejectUserWithInvalidToken2();
    await restRejectUserWithInvalidSignatureToken();
    await restRejectUserWithExpiredToken();
    await restPermitAccessWithValidToken(auth);
    await restTestPublicEndpoints(auth);
    await restTestRegularEndpoints(auth);
    await testAdminEndpoints(auth);

    console.info("Authorization tests successful!");
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
