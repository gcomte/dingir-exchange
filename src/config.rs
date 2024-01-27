use config_rs::{Config, File};
use fluidex_common::rust_decimal::Decimal;
use paperclip::actix::Apiv2Schema;
use serde::de;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default, Apiv2Schema)]
#[serde(default)]
pub struct Asset {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub prec_save: u32,
    pub prec_show: u32,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MarketUnit {
    pub asset_id: String,
    pub prec: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Apiv2Schema)]
#[serde(default)]
pub struct Market {
    pub name: String,
    pub base: String,
    pub quote: String,
    pub amount_prec: u32,
    pub price_prec: u32,
    pub fee_prec: u32,
    pub min_amount: Decimal,
}

impl Default for MarketUnit {
    fn default() -> Self {
        MarketUnit {
            asset_id: "".to_string(),
            prec: 0,
        }
    }
}

impl Default for Market {
    fn default() -> Self {
        Market {
            name: "".to_string(),
            fee_prec: 4,
            min_amount: Decimal::from_str("0.01").unwrap(),
            base: Default::default(),
            quote: Default::default(),
            amount_prec: 0,
            price_prec: 0,
        }
    }
}

#[derive(Debug, PartialEq, Copy, Clone)]
pub enum PersistPolicy {
    Dummy,
    Both,
    ToDB,
    ToMessage,
}

impl<'de> de::Deserialize<'de> for PersistPolicy {
    fn deserialize<D: de::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;

        match s.as_ref() {
            "Both" | "both" => Ok(PersistPolicy::Both),
            "Db" | "db" | "DB" => Ok(PersistPolicy::ToDB),
            "Message" | "message" => Ok(PersistPolicy::ToMessage),
            "Dummy" | "dummy" => Ok(PersistPolicy::Dummy),
            _ => Err(serde::de::Error::custom("unexpected specification for persist policy")),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub debug: bool,
    pub db_log: String,
    pub db_history: String,
    pub keycloak_pubkey: String,
    pub keycloak_admin_role: String,
    pub keycloak_deposit_admin_role: String,
    pub keycloak_withdrawal_admin_role: String,
    pub history_persist_policy: PersistPolicy,
    pub market_from_db: bool,
    pub assets: Vec<Asset>,
    pub markets: Vec<Market>,
    pub brokers: String,
    pub consumer_group: String,
    pub persist_interval: i32,
    pub slice_interval: i32,
    pub slice_keeptime: i32,
    pub history_thread: i32,
    pub cache_timeout: f64,
    pub disable_self_trade: bool,
    pub disable_market_order: bool,
    pub user_order_num_limit: usize,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            debug: false,
            db_log: Default::default(),
            db_history: Default::default(),
            keycloak_pubkey: Default::default(),
            keycloak_admin_role: Default::default(),
            keycloak_deposit_admin_role: Default::default(),
            keycloak_withdrawal_admin_role: Default::default(),
            history_persist_policy: PersistPolicy::ToMessage,
            market_from_db: true,
            assets: Vec::new(),
            markets: Vec::new(),
            consumer_group: "kline_data_fetcher".to_string(),
            brokers: "127.0.0.1:9092".to_string(),
            persist_interval: 3600,
            slice_interval: 86400,
            slice_keeptime: 86400 * 3,
            history_thread: 10,
            cache_timeout: 0.45,
            disable_self_trade: true,
            disable_market_order: false,
            user_order_num_limit: 1000,
        }
    }
}

impl TryFrom<Config> for Settings {
    type Error = config_rs::ConfigError;

    fn try_from(config: Config) -> Result<Self, Self::Error> {
        Ok(Settings {
            debug: config.get("debug").unwrap_or_default(),
            db_log: config.get("db_log").unwrap_or_default(),
            db_history: config.get("db_history").unwrap_or_default(),
            keycloak_pubkey: config.get("keycloak_pubkey").unwrap_or_default(),
            keycloak_admin_role: config.get("keycloak_admin_role").unwrap_or_default(),
            keycloak_deposit_admin_role: config
                .get("keycloak_deposit_admin_role")
                .unwrap_or_default(),
            keycloak_withdrawal_admin_role: config
                .get("keycloak_withdrawal_admin_role")
                .unwrap_or_default(),
            history_persist_policy: PersistPolicy::ToMessage,
            market_from_db: config.get("market_from_db").unwrap_or_default(),
            assets: config.get("assets").unwrap_or_default(),
            markets: config.get("markets").unwrap_or_default(),
            consumer_group: config.get("consumer_group").unwrap_or_default(),
            brokers: config.get("brokers").unwrap_or_default(),
            persist_interval: config.get("persist_interval").unwrap_or_default(),
            slice_interval: config.get("slice_interval").unwrap_or_default(),
            slice_keeptime: config.get("slice_keeptime").unwrap_or_default(),
            history_thread: config.get("history_thread").unwrap_or_default(),
            cache_timeout: config.get("cache_timeout").unwrap_or_default(),
            disable_self_trade: config.get("disable_self_trade").unwrap_or_default(),
            disable_market_order: config.get("disable_market_order").unwrap_or_default(),
            user_order_num_limit: config.get("user_order_num_limit").unwrap_or_default(),
        })
    }
}


impl Settings {
    pub fn new() -> Self {
        // Initializes with `config/default.yaml`.
        let run_mode = dotenv::var("RUN_MODE").unwrap_or_else(|_| "development".into());
        let run_config = format!("config/{}", run_mode);

        let conf = Config::builder()
            .add_source(File::with_name("config/default"))
            .add_source(File::with_name(&run_config).required(false))
            .build().unwrap()
            .try_into().unwrap();

        conf
    }
}
