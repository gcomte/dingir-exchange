import axios, { AxiosInstance } from "axios";
import * as _ from "lodash";

const REST_API_SERVER = "http://localhost:50053/api/exchange/panel";

class RESTClient {
  client: AxiosInstance;

  constructor(server = process.env.REST_API_SERVER || REST_API_SERVER) {
    console.log("using REST API server: ", server);
    this.client = axios.create({
      baseURL: server,
      timeout: 1000,
    });
  }

  async ping(token: string) {
    this.setAuth(token);
    await this.client.get(`/ping`);
  }

  async authping(token: string) {
    this.setAuth(token);
    await this.client.get(`/authping`);
  }

  async orderTrades(token: string, market: string, orderId: number) {
    this.setAuth(token);
    await this.client.get(`/ordertrades/${market}/${orderId}`);
  }

  async ticker(token: string, time_frame: string, market: string) {
    this.setAuth(token);
    await this.client.get(`/ticker_${time_frame}/${market}`);
  }

  async tradingView(token: string) {
    this.setAuth(token);
    await this.client.get(`/tradingview/time`);
    await this.client.get(`/tradingview/config`);
    await this.client.get(`/tradingview/search?query=asdf`); // Idk what this does and how it should be used.
    await this.client.get(`/tradingview/symbols?symbol=BTC`); // Idk what this does and how it should be used.
    await this.client.get(`/tradingview/history`);
  }

  async closedOrders(token: string, market: string) {
    this.setAuth(token);
    await this.client.get(`/closedorders/${market}`);
  }

  async recentTrades(token: string, market: string) {
    this.setAuth(token);
    await this.client.get(`/recenttrades/${market}`);
  }

  async manage_reload(token: string) {
    this.setAuth(token);
    await this.client.get(`/manage/market/reload`);
  }

  async manage_traid_pairs(token: string, new_market: any) {
    this.setAuth(token);
    await this.client.post(`/manage/market/tradepairs`, new_market);
  }

  async manage_assets(token: string, new_asset: any) {
    this.setAuth(token);
    await this.client.post(`/manage/market/assets`, new_asset);
  }

  setAuth(token: string) {
    if (token !== "") {
      this.client.defaults.headers.common["Authorization"] = token;
    }
  }
}

let defaultRESTClient = new RESTClient();
export { defaultRESTClient, RESTClient };
