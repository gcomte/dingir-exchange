import fetch from "node-fetch";
import { credentials, TestUser } from "./config";

class Authentication {
  tokens: Map<TestUser, any> = new Map();

  getExpiredAuthTokenMeta() {
    return { Authorization: process.env.JWT_EXPIRED };
  }

  getInvalidSignatureAuthTokenMeta() {
    return { Authorization: process.env.JWT_INVALID_SIGNATURE };
  }

  getInvalidInvalidAuthTokenMeta() {
    return { Authorization: "LOREM_IPSUM" };
  }

  async getAuthTokenMeta(user: TestUser) {
    return { Authorization: await this.getAuthTokenMetaValue(user) };
  }

  async getAuthTokenMetaValue(user: TestUser) {
    const c = credentials[user];

    if (!this.tokens.has(user)) {
      const token = await this.getUserAuthToken(c.username, c.password);
      this.tokens.set(user, token);
    }
    return this.tokens.get(user);
  }

  async getUserAuthToken(user, password) {
    const response = await fetch(
      "https://" + process.env.KC_URL + "/auth/realms/" + process.env.KC_REALM + "/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:
          "client_id=" +
          process.env.KC_CLIENT_ID +
          "&client_secret=" +
          process.env.KC_CLIENT_SECRET +
          "&username=" +
          user +
          "&password=" +
          password +
          "&grant_type=password&scope=openid",
      }
    );
    const data = await response.json();

    return data.access_token;
  }
}

let defaultAuth = new Authentication();
export { defaultAuth, Authentication };
