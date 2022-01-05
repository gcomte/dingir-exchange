import * as Dotenv from "dotenv";
Dotenv.config();

export const VERBOSE = !!process.env.VERBOSE;

// constants
export const ORDER_SIDE_ASK = 0;
export const ORDER_SIDE_BID = 1;
export const ORDER_TYPE_LIMIT = 0;
export const ORDER_TYPE_MARKET = 1;

export enum TestUser {
  ADMIN,
  USER1,
  USER2,
}

export const credentials = {
  [TestUser.ADMIN]: {
    username: process.env.KC_ADMIN_NAME,
    password: process.env.KC_ADMIN_PASSWORD,
  },
  [TestUser.USER1]: {
    username: process.env.KC_USER1_NAME,
    password: process.env.KC_USER1_PASSWORD,
  },
  [TestUser.USER2]: {
    username: process.env.KC_USER2_NAME,
    password: process.env.KC_USER2_PASSWORD,
  },
};

export const base = "DIF";
export const quote = "BTC";
export const market = `${base}_${quote}`;
export const fee = "0";

// global config
import { inspect } from "util";
inspect.defaultOptions.depth = null;
