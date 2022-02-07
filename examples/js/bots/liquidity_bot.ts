import { Client, defaultClient } from "../client";
import { ORDER_SIDE_ASK, ORDER_SIDE_BID, ORDER_TYPE_LIMIT, TestUser } from "../config";

interface LiquidityBotConfig {
  base: string;
  quote: string;
  deviation: number;
  tiersAmount: number;
  userId: TestUser;
  client: Client;
}

class LiquidityBot {
  market: string;
  makerFee = 0;
  takerFee = 0;
  balanceCache = {};

  constructor(private config: LiquidityBotConfig) {
    this.market = `${config.base}_${config.quote}`;
  }

  async tick() {
    const { quote, base, userId, deviation, tiersAmount } = this.config;
    const balance = await this.config.client.balanceQuery(userId);

    const balanceQuote = +balance.get(quote).available + +balance.get(quote).frozen;
    const balanceBase = +balance.get(base).available + +balance.get(base).frozen;

    if (this.balanceCache[quote] === balanceQuote && this.balanceCache[base] === balanceBase) {
      console.log("not trades happend, skipping");
      return;
    }
    console.log("trades happend, adjusting orders");

    this.balanceCache[quote] = balanceQuote;
    this.balanceCache[base] = balanceBase;

    const getPrice = (tier: number, side: number) => {
      return (balanceQuote * Math.pow(deviation, side * (2 * tier + 1))) / balanceBase;
    };

    const orders = new Array(tiersAmount).fill(null).reduce((acc: any[], _, tier) => {
      const askPrice = getPrice(tier, 1);
      const askAmount = balanceBase / Math.pow(deviation, tier) - balanceBase / Math.pow(deviation, tier + 1);
      const askOrder = this.createOrder(ORDER_SIDE_ASK, askPrice, askAmount);

      const bidPrice = getPrice(tier, -1);
      const bidAmount = balanceBase * Math.pow(deviation, tier + 1) - balanceBase * Math.pow(deviation, tier);
      const bidOrder = this.createOrder(ORDER_SIDE_BID, bidPrice, bidAmount);

      acc = [...acc, askOrder, bidOrder];
      return acc;
    }, []);

    await this.config.client.batchOrderPut(userId, this.market, true, orders);
  }

  createOrder(order_side: number, price: number, amount: number) {
    const market = this.config.client.markets.get(this.market);
    return {
      market: this.market,
      order_side,
      order_type: ORDER_TYPE_LIMIT,
      price: this.round(price, order_side, market.price_precision),
      amount: this.round(amount, order_side, market.amount_precision),
      taker_fee: this.takerFee,
      maker_fee: this.makerFee,
    };
  }

  round(amount: number, orderSide: number, precision: number) {
    const multiplier = Math.pow(10, precision);
    const rounded = amount * multiplier;

    switch (orderSide) {
      case ORDER_SIDE_ASK:
        return Math.ceil(rounded) / multiplier;
      case ORDER_SIDE_BID:
        return Math.floor(rounded) / multiplier;
      default:
        return Math.round(rounded) / multiplier;
    }
  }
}

export async function main() {
  await defaultClient.connect();

  const bot1 = new LiquidityBot({
    base: "DIF",
    quote: "BTC",
    deviation: 1.002, // 0.2%
    tiersAmount: 20,
    userId: TestUser.USER1,
    client: defaultClient,
  });

  const bot2 = new LiquidityBot({
    base: "DIF",
    quote: "BTC",
    deviation: 1.002, // 0.2%
    tiersAmount: 20,
    userId: TestUser.USER2,
    client: defaultClient,
  });

  setInterval(() => {
    bot1.tick().catch(console.error);
  }, 2000);

  setTimeout(() => {
    setInterval(() => {
      bot2.tick().catch(console.error);
    }, 2000);
  }, 1000);
}

main();
