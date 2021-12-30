//deposit a lot to engine, so we would not encounter "balance not enough" failure

import { depositAssets } from "../exchange_helper";
import { TestUser } from "../config";

async function main() {
  //if I really had so much money ....
  await depositAssets({ BTC: "10000000.0", DIF: "50000.0" }, TestUser.USER1);
  await depositAssets({ BTC: "10000.0", DIF: "50.0" }, TestUser.USER1);
}

main().catch(console.log);
