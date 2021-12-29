import { defaultClient as client } from "../client";
import { TestUser } from "../config";

async function main() {
  //    Dotenv.config()
  try {
    await client.reloadMarkets(await this.auth.getAuthTokenMeta(TestUser.ADMIN));
  } catch (error) {
    console.error("Caught error:", error);
  }
}

main();
