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

  async closed_orders(token: string) {
    if (token !== "") {
      this.client.defaults.headers.common["Authorization"] = "LoremIpsum";
    }

    await this.client.get(`/closedorders/ETH_USDT`);
  }
}

let defaultRESTClient = new RESTClient();
export { defaultRESTClient, RESTClient };
