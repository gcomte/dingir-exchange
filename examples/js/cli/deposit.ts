//deposit a lot to engine, so we would not encounter "balance not enough" failure

import { depositAssets } from "../exchange_helper";
import { TestUser } from "../config";

async function main() {
  //if I really had so much money ....
  await depositAssets({ BTC: "10000000.0", DIF: "50000.0" }, process.env.KC_USER1_ID, TestUser.DEPOSIT_ADMIN);
  await depositAssets({ BTC: "10000.0", DIF: "50.0" }, process.env.KC_USER1_ID, TestUser.DEPOSIT_ADMIN);
}

main().catch(console.log);
