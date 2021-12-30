use crate::config::{Asset, Market};
use paperclip::actix::Apiv2Schema;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub struct KlineReq {
    pub from: i32,
    pub to: i32,
    pub symbol: String,
    pub resolution: i32,
    pub usemock: Option<String>,
}
#[derive(Serialize, Deserialize, Default, Apiv2Schema)]
pub struct KlineResult {
    pub s: String, // status, 'ok' or 'no_data' etc
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub t: Vec<i32>, // timestamp
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub c: Vec<f32>, // closing price
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub o: Vec<f32>, // opening price
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub h: Vec<f32>, // highest price
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub l: Vec<f32>, // lowest price
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub v: Vec<f32>, // trading volume
    #[serde(rename = "nextTime", skip_serializing_if = "Option::is_none")]
    pub nxt: Option<i32>,
}

#[derive(Serialize, Deserialize, Default, Debug, Clone, Apiv2Schema)]
pub struct TickerResult {
    pub market: String,
    #[serde(rename = "price_change_percent")]
    pub change: f32,
    pub last: f32,
    pub high: f32,
    pub low: f32,
    pub volume: f32,
    pub quote_volume: f32,
    pub from: u64,
    pub to: u64,
}

#[derive(Serialize, Deserialize, Apiv2Schema)]
pub struct MarketTrade {
    pub time: String,
    pub trade_id: i64,
    pub amount: String,
    pub quote_amount: String,
    pub price: String,
    pub fee: String,
}

#[derive(Serialize, Deserialize, Apiv2Schema)]
pub struct OrderTradeResult {
    pub trades: Vec<MarketTrade>,
}

#[derive(Serialize, Deserialize, Apiv2Schema)]
pub struct NewAssetReq {
    pub assets: Vec<Asset>,
    #[serde(default)]
    pub not_reload: bool,
    // REST interface for NewAssetReq internally calls the GRPC interface and must therefore forward the JWT
    pub jwt: String,
}

#[derive(Serialize, Deserialize, Default, Apiv2Schema)]
pub struct NewTradePairReq {
    pub market: Market,
    #[serde(default)]
    pub asset_base: Option<Asset>,
    #[serde(default)]
    pub asset_quote: Option<Asset>,
    #[serde(default)]
    pub not_reload: bool,
}
