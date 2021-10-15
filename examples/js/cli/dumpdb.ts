import { defaultClient as client } from "../client";
import { TestUser } from "../config";

async function main() {
  //    Dotenv.config()
  try {
    await client.debugDump(TestUser.ADMIN);
  } catch (error) {
    console.error("Catched error:", error);
  }
}

main();
