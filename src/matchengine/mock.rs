use crate::asset::{AssetManager, BalanceManager};
use crate::config;
use fluidex_common::rust_decimal::Decimal;
use fluidex_common::rust_decimal_macros::*;

pub fn get_simple_market_config() -> config::Market {
    config::Market {
        name: String::from("ETH_USDT"),
        base: MockAsset::ETH.id(),
        quote: MockAsset::USDT.id(),
        amount_prec: 4,
        price_prec: 2,
        fee_prec: 2,
        min_amount: dec!(0.01),
    }
}
pub fn get_integer_prec_market_config() -> config::Market {
    config::Market {
        name: String::from("ETH_USDT"),
        base: MockAsset::ETH.id(),
        quote: MockAsset::USDT.id(),
        amount_prec: 0,
        price_prec: 0,
        fee_prec: 0,
        min_amount: dec!(0),
    }
}

// TODO: implement and use Into for MockAsset
pub fn get_simple_asset_config(prec: u32) -> Vec<config::Asset> {
    vec![
        config::Asset {
            id: MockAsset::USDT.id(),
            symbol: MockAsset::USDT.symbol(),
            name: MockAsset::USDT.name(),
            prec_save: prec,
            prec_show: prec,
        },
        config::Asset {
            id: MockAsset::ETH.id(),
            symbol: MockAsset::ETH.symbol(),
            name: MockAsset::ETH.name(),
            prec_save: prec,
            prec_show: prec,
        },
    ]
}

#[allow(clippy::upper_case_acronyms)]
#[derive(Debug)]
pub enum MockAsset {
    ETH,
    USDT,
}
impl MockAsset {
    pub fn id(self) -> String {
        match self {
            MockAsset::ETH => String::from("ETH"),
            MockAsset::USDT => String::from("USDT"),
        }
    }
    pub fn symbol(self) -> String {
        match self {
            MockAsset::ETH => String::from("ETH"),
            MockAsset::USDT => String::from("USDT"),
        }
    }
    pub fn name(self) -> String {
        match self {
            MockAsset::ETH => String::from("Ether"),
            MockAsset::USDT => String::from("Tether USD"),
        }
    }
}

pub fn get_simple_asset_manager(assets: Vec<config::Asset>) -> AssetManager {
    AssetManager::new(&assets).unwrap()
}
pub fn get_simple_balance_manager(assets: Vec<config::Asset>) -> BalanceManager {
    BalanceManager::new(&assets).unwrap()
}

fn get_market_base_and_quote(market: &str) -> (String, String) {
    let splits: Vec<&str> = market.split("_").collect();
    (splits[0].to_owned(), splits[1].to_owned())
}
