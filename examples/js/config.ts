import * as Dotenv from "dotenv";
Dotenv.config();

export const VERBOSE = !!process.env.VERBOSE;

// constants
export const ORDER_SIDE_ASK = 0;
export const ORDER_SIDE_BID = 1;
export const ORDER_TYPE_LIMIT = 0;
export const ORDER_TYPE_MARKET = 1;

// fake data
export enum TestUser {
  ADMIN,
  DEPOSIT_ADMIN,
  WITHDRAWAL_ADMIN,
  USER1,
  USER2,
}

export const base = "DIF";
export const quote = "BTC";
export const market = `${base}_${quote}`;
export const fee = "0";

// global config
import { inspect } from "util";
inspect.defaultOptions.depth = null;
