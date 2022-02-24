import fetch from "node-fetch";
import { TestUser } from "./config";

class Authentication {
  adminToken: undefined;
  depositAdminToken: undefined;
  withdrawalAdminToken: undefined;
  user1Token: undefined;
  user2Token: undefined;

  async getAuthTokenMeta(user) {
    return { Authorization: await this.getAuthTokenMetaValue(user) };
  }

  getExpiredAuthTokenMeta() {
    return { Authorization: process.env.JWT_EXPIRED };
  }

  getInvalidSignatureAuthTokenMeta() {
    return { Authorization: process.env.JWT_INVALID_SIGNATURE };
  }

  getInvalidInvalidAuthTokenMeta() {
    return { Authorization: "LOREM_IPSUM" };
  }

  async getAuthTokenMetaValue(user) {
    switch (user) {
      case TestUser.ADMIN:
        return "Bearer " + (await this.getAdminAuthToken());
      case TestUser.DEPOSIT_ADMIN:
        return "Bearer " + (await this.getDepositAdminAuthToken());
      case TestUser.WITHDRAWAL_ADMIN:
        return "Bearer " + (await this.getWithdrawalAdminAuthToken());
      case TestUser.USER1:
        return "Bearer " + (await this.getUser1AuthToken());
      case TestUser.USER2:
        return "Bearer " + (await this.getUser2AuthToken());
    }
  }

  async getAdminAuthToken() {
    // cache the token
    if (this.adminToken == undefined) {
      this.adminToken = await this.getUserAuthToken(process.env.KC_ADMIN_NAME, process.env.KC_ADMIN_PASSWORD);
    }

    return this.adminToken;
  }

  async getDepositAdminAuthToken() {
    // cache the token
    if (this.depositAdminToken == undefined) {
      this.depositAdminToken = await this.getUserAuthToken(process.env.KC_DEPOSIT_ADMIN_NAME, process.env.KC_DEPOSIT_ADMIN_PASSWORD);
    }

    return this.depositAdminToken;
  }
  async getWithdrawalAdminAuthToken() {
    // cache the token
    if (this.withdrawalAdminToken == undefined) {
      this.withdrawalAdminToken = await this.getUserAuthToken(
        process.env.KC_WITHDRAWAL_ADMIN_NAME,
        process.env.KC_WITHDRAWAL_ADMIN_PASSWORD
      );
    }

    return this.withdrawalAdminToken;
  }

  async getUser1AuthToken() {
    // cache the token
    if (this.user1Token == undefined) {
      this.user1Token = await this.getUserAuthToken(process.env.KC_USER1_NAME, process.env.KC_USER1_PASSWORD);
    }

    return this.user1Token;
  }

  async getUser2AuthToken() {
    // cache the token
    if (this.user2Token == undefined) {
      this.user2Token = await this.getUserAuthToken(process.env.KC_USER2_NAME, process.env.KC_USER2_PASSWORD);
    }

    return this.user2Token;
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
