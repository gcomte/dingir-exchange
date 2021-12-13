use crate::asset::update_controller::{BalanceUpdateParams, BusinessType};
use crate::asset::{BalanceManager, BalanceType, BalanceUpdateController};
use crate::config::{self};
use crate::database::{DatabaseWriterConfig, OperationLogSender};
use crate::history::DatabaseHistoryWriter;
use crate::market::{self, Order, OrderInput};
use crate::message::{FullOrderMessageManager, SimpleMessageManager};
use crate::models::{self};
use crate::persist::{CompositePersistor, DBBasedPersistor, DummyPersistor, FileBasedPersistor, MessengerBasedPersistor, PersistExector};
use crate::sequencer::Sequencer;
use crate::storage::config::MarketConfigs;
use crate::types::{ConnectionType, DbType, SimpleResult};

use anyhow::{anyhow, bail};
use fluidex_common::helper::{MergeSortIterator, Order as SortOrder};
use fluidex_common::rust_decimal::prelude::Zero;
use fluidex_common::rust_decimal::Decimal;
use fluidex_common::utils::timeutil::{current_timestamp, FTimestamp};
use orchestra::rpc::exchange::*;
use serde::Serialize;
use serde_json::json;
use sqlx::Connection;
use sqlx::Executor;
use tonic::{self, Status};

use std::collections::HashMap;
use std::convert::TryFrom;
use std::str::FromStr;
use uuid::Uuid;

type MarketName = String;
type BaseAsset = String;
type QuoteAsset = String;

pub trait OperationLogConsumer {
    fn is_block(&self) -> bool;
    fn append_operation_log(&mut self, item: models::OperationLog) -> anyhow::Result<(), models::OperationLog>;
}

impl OperationLogConsumer for OperationLogSender {
    fn is_block(&self) -> bool {
        self.is_block()
    }
    fn append_operation_log(&mut self, item: models::OperationLog) -> anyhow::Result<(), models::OperationLog> {
        self.append(item)
    }
}

// TODO: reuse pool of two dbs when they are same?
fn create_persistor(settings: &config::Settings) -> Box<dyn PersistExector> {
    let persist_to_mq = true;
    let persist_to_mq_full_order = true;
    let persist_to_db = false;
    let persist_to_file = false;
    let mut persistor = Box::new(CompositePersistor::default());
    if !settings.brokers.is_empty() && persist_to_mq {
        persistor.add_persistor(Box::new(MessengerBasedPersistor::new(Box::new(
            SimpleMessageManager::new_and_run(&settings.brokers).unwrap(),
        ))));
    }
    if !settings.brokers.is_empty() && persist_to_mq_full_order {
        persistor.add_persistor(Box::new(MessengerBasedPersistor::new(Box::new(
            FullOrderMessageManager::new_and_run(&settings.brokers).unwrap(),
        ))));
    }
    if persist_to_db {
        // persisting to db is disabled now
        let pool = sqlx::Pool::<DbType>::connect_lazy(&settings.db_history).unwrap();
        persistor.add_persistor(Box::new(DBBasedPersistor::new(Box::new(
            DatabaseHistoryWriter::new(
                &DatabaseWriterConfig {
                    spawn_limit: 4,
                    apply_benchmark: true,
                    capability_limit: 8192,
                },
                &pool,
            )
            .unwrap(),
        ))));
    }
    if settings.brokers.is_empty() || persist_to_file {
        persistor.add_persistor(Box::new(FileBasedPersistor::new("persistor_output.txt")));
    }
    persistor
}

// match engine is single-threaded. So `Controller` is used as the only entrance
// for get and set the global state
pub struct Controller {
    //<LogHandlerType> where LogHandlerType: OperationLogConsumer + Send {
    pub settings: config::Settings,
    pub sequencer: Sequencer,
    pub balance_manager: BalanceManager,
    //    pub asset_manager: AssetManager,
    pub update_controller: BalanceUpdateController,
    pub markets: HashMap<MarketName, market::Market>,
    pub asset_market_names: HashMap<(BaseAsset, QuoteAsset), MarketName>,
    // TODO: is it worth to use generics rather than dynamic pointer?
    pub log_handler: Box<dyn OperationLogConsumer + Send + Sync>,
    pub persistor: Box<dyn PersistExector>,
    // TODO: is this needed?
    pub dummy_persistor: Box<dyn PersistExector>,
    db_pool: sqlx::Pool<DbType>,
    market_load_cfg: MarketConfigs,
}

const ORDER_LIST_MAX_LEN: usize = 100;
const OPERATION_BALANCE_UPDATE: &str = "balance_update";
const OPERATION_ORDER_CANCEL: &str = "order_cancel";
const OPERATION_ORDER_CANCEL_ALL: &str = "order_cancel_all";
const OPERATION_ORDER_PUT: &str = "order_put";
const OPERATION_BATCH_ORDER_PUT: &str = "batch_order_put";
const OPERATION_TRANSFER: &str = "transfer";

pub fn create_controller(cfgs: (config::Settings, MarketConfigs)) -> Controller {
    let settings = cfgs.0;
    let main_pool = sqlx::Pool::<DbType>::connect_lazy(&settings.db_log).unwrap();
    let balance_manager = BalanceManager::new(&settings.assets).unwrap();

    let update_controller = BalanceUpdateController::new();
    //        let asset_manager = AssetManager::new(&settings.assets).unwrap();
    let sequencer = Sequencer::default();
    let mut markets = HashMap::new();
    let mut asset_market_names = HashMap::new();
    for entry in &settings.markets {
        let market = market::Market::new(entry, &settings, &balance_manager).unwrap();
        markets.insert(entry.name.clone(), market);
        asset_market_names.insert((entry.base.clone(), entry.quote.clone()), entry.name.clone());
    }

    let persistor = create_persistor(&settings);
    let log_handler = OperationLogSender::new(&DatabaseWriterConfig {
        spawn_limit: 4,
        apply_benchmark: true,
        capability_limit: 8192,
    })
    .start_schedule(&main_pool)
    .unwrap();
    Controller {
        settings,
        sequencer,
        //            asset_manager,
        balance_manager,
        update_controller,
        markets,
        asset_market_names,
        log_handler: Box::<OperationLogSender>::new(log_handler),
        persistor,
        dummy_persistor: DummyPersistor::new_box(),
        db_pool: main_pool,
        market_load_cfg: cfgs.1,
    }
}

impl Controller {
    //fn get_persistor(&mut self, real: bool) -> &mut Box<dyn PersistExector> {
    //if real {&mut self.persistor} else { &mut self.dummy_persistor }
    //}
    //fn get_persistor(&mut self, real: bool) -> Box<dyn PersistExector> {
    //    if real {self.persistor} else { self.dummy_persistor }
    //}
    pub fn asset_list(&self, _req: AssetListRequest) -> Result<AssetListResponse, Status> {
        let result = AssetListResponse {
            asset_lists: self
                .settings
                .assets
                .iter()
                .map(|item| asset_list_response::AssetInfo {
                    symbol: item.symbol.clone(),
                    name: item.name.clone(),
                    precision: item.prec_show,
                })
                .collect(),
        };
        Ok(result)
    }
    pub fn balance_query(&self, req: BalanceQueryRequest, user_id: Uuid) -> Result<BalanceQueryResponse, Status> {
        let all_asset_param_valid = req
            .assets
            .iter()
            .all(|asset_param| self.settings.assets.iter().any(|asset| asset.id.eq(asset_param)));
        if !all_asset_param_valid {
            return Err(Status::invalid_argument("invalid asset"));
        }
        let query_assets = if req.assets.is_empty() {
            self.settings.assets.iter().map(|asset| asset.id.clone()).collect()
        } else {
            req.assets
        };
        let balance_manager = &self.balance_manager;
        let balances = query_assets
            .into_iter()
            .map(|asset_id| {
                let available = balance_manager
                    .get_with_round(user_id, BalanceType::AVAILABLE, &asset_id)
                    .to_string();
                let frozen = balance_manager.get_with_round(user_id, BalanceType::FREEZE, &asset_id).to_string();
                balance_query_response::AssetBalance {
                    asset_id,
                    available,
                    frozen,
                }
            })
            .collect();
        Ok(BalanceQueryResponse { balances })
    }
    pub fn order_query(&self, req: OrderQueryRequest, user_id: Uuid) -> Result<OrderQueryResponse, Status> {
        if req.market != "all" && !self.markets.contains_key(&req.market) {
            return Err(Status::invalid_argument("invalid market"));
        }
        // TODO: magic number
        let max_order_num = 100;
        let default_order_num = 10;
        let limit = if req.limit <= 0 {
            default_order_num
        } else if req.limit > max_order_num {
            max_order_num
        } else {
            req.limit
        };
        let markets = self
            .markets
            .iter()
            .filter(|(key, _market)| req.market == "all" || req.market == **key)
            .map(|(_key, market)| market);
        let total_order_count: usize = markets
            .clone()
            .map(|m| m.users.get(&user_id).map(|order_map| order_map.len()).unwrap_or(0))
            .sum();
        let orders_by_market: Vec<Box<dyn Iterator<Item = Order>>> = markets
            .map(|m| {
                m.users
                    .get(&user_id)
                    .map(|order_map| Box::new(order_map.values().rev().map(|order_rc| order_rc.deep())) as Box<dyn Iterator<Item = Order>>)
                    .unwrap_or_else(|| Box::new(Vec::new().into_iter()) as Box<dyn Iterator<Item = Order>>)
            })
            .collect();
        // TODO: support ASC in the API
        let orders = MergeSortIterator::compare_by(orders_by_market, SortOrder::Desc, |a, b| a.id.cmp(&b.id))
            .skip(req.offset as usize)
            .take(limit as usize)
            .map(OrderInfo::from)
            .collect();
        let result = OrderQueryResponse {
            offset: req.offset,
            limit,
            total: total_order_count as i32,
            orders,
        };
        Ok(result)
    }
    pub fn order_book_depth(&self, req: OrderBookDepthRequest) -> Result<OrderBookDepthResponse, Status> {
        // TODO cache
        let market = self
            .markets
            .get(&req.market)
            .ok_or_else(|| Status::invalid_argument("invalid market"))?;
        // TODO check interval
        let interval = if req.interval.is_empty() {
            Decimal::zero()
        } else {
            Decimal::from_str(&req.interval).map_err(|_| Status::invalid_argument("invalid interval"))?
        };
        let depth = market.depth(req.limit as usize, &interval);
        let convert = |price_info: &Vec<market::PriceInfo>| {
            price_info
                .iter()
                .map(|price_info| order_book_depth_response::PriceInfo {
                    price: price_info.price.to_string(),
                    amount: price_info.amount.to_string(),
                })
                .collect::<Vec<_>>()
        };
        Ok(OrderBookDepthResponse {
            asks: convert(&depth.asks),
            bids: convert(&depth.bids),
        })
    }

    pub fn order_detail(&self, req: OrderDetailRequest) -> Result<OrderInfo, Status> {
        let market = self
            .markets
            .get(&req.market)
            .ok_or_else(|| Status::invalid_argument("invalid market"))?;
        let order = market
            .get(req.order_id)
            .ok_or_else(|| Status::invalid_argument("invalid order_id"))?;
        Ok(OrderInfo::from(order))
    }

    pub fn market_list(&self, _req: MarketListRequest) -> Result<MarketListResponse, Status> {
        let markets = self
            .markets
            .values()
            .map(|market| market_list_response::MarketInfo {
                name: String::from(market.name),
                base: market.base.into(),
                quote: market.quote.into(),
                fee_precision: market.fee_prec,
                amount_precision: market.amount_prec,
                price_precision: market.price_prec,
                min_amount: market.min_amount.to_string(),
            })
            .collect();
        Ok(MarketListResponse { markets })
    }

    pub fn market_summary(&self, req: MarketSummaryRequest) -> Result<MarketSummaryResponse, Status> {
        let markets: Vec<String> = if req.markets.is_empty() {
            self.markets.keys().cloned().collect()
        } else {
            for market in &req.markets {
                if !self.markets.contains_key(market) {
                    return Err(Status::invalid_argument("invalid market"));
                }
            }
            req.markets
        };
        let market_summaries = markets
            .iter()
            .map(|market| {
                let status = self.markets.get(market).unwrap().status();
                market_summary_response::MarketSummary {
                    name: status.name,
                    ask_count: status.ask_count as i32,
                    ask_amount: status.ask_amount.to_string(),
                    bid_count: status.bid_count as i32,
                    bid_amount: status.bid_amount.to_string(),
                    trade_count: status.trade_count,
                }
            })
            .collect();
        Ok(MarketSummaryResponse { market_summaries })
    }

    fn check_service_available(&self) -> bool {
        if self.log_handler.is_block() {
            log::warn!("log_handler full");
            return false;
        }
        self.persistor.service_available()
    }

    pub fn update_balance(
        &mut self,
        real: bool,
        req: BalanceUpdateRequest,
        user_id: Uuid,
    ) -> std::result::Result<BalanceUpdateResponse, Status> {
        if !self.check_service_available() {
            return Err(Status::unavailable(""));
        }
        let asset = &req.asset;
        if !self.balance_manager.asset_manager.asset_exist(asset) {
            return Err(Status::invalid_argument("invalid asset"));
        }
        let prec = self.balance_manager.asset_manager.asset_prec_show(asset);
        let change_result = Decimal::from_str(req.delta.as_str()).map_err(|_| Status::invalid_argument("invalid amount"))?;
        let change = change_result.round_dp(prec);
        let detail_json: serde_json::Value = if req.detail.is_empty() {
            json!({})
        } else {
            serde_json::from_str(req.detail.as_str()).map_err(|_| Status::invalid_argument("invalid detail"))?
        };
        //let persistor = self.get_persistor(real);
        let persistor = if real { &mut self.persistor } else { &mut self.dummy_persistor };
        let business_type = if change.is_sign_positive() {
            BusinessType::Deposit
        } else {
            BusinessType::Withdraw
        };
        // Get market price of requested base asset and quote asset of USDT.
        let market_price = match self.asset_market_names.get(&(asset.to_owned(), "USDT".to_owned())) {
            Some(market_name) => self.markets.get(market_name).unwrap().price,
            None => Decimal::zero(),
        };
        self.update_controller
            .update_user_balance(
                &mut self.balance_manager,
                persistor,
                BalanceUpdateParams {
                    balance_type: BalanceType::AVAILABLE,
                    business_type,
                    user_id,
                    asset: asset.to_owned(),
                    business: req.business.clone(),
                    business_id: req.business_id,
                    market_price,
                    change,
                    detail: detail_json,
                },
            )
            .map_err(|e| Status::invalid_argument(format!("{}", e)))?;

        // TODO how to handle this error?
        // TODO operation_log after exec or before exec?
        if real {
            self.append_operation_log(OPERATION_BALANCE_UPDATE, &req, user_id);
        }
        Ok(BalanceUpdateResponse::default())
    }

    pub fn order_put(&mut self, real: bool, req: OrderPutRequest, user_id: Uuid) -> Result<OrderInfo, Status> {
        if !self.check_service_available() {
            return Err(Status::unavailable(""));
        }
        let order = self.put_order(real, &req, user_id)?;
        if real {
            self.append_operation_log(OPERATION_ORDER_PUT, &req, user_id);
        }
        Ok(OrderInfo::from(order))
    }

    pub fn batch_order_put(&mut self, real: bool, req: BatchOrderPutRequest, user_id: Uuid) -> Result<BatchOrderPutResponse, Status> {
        if !self.check_service_available() {
            return Err(Status::unavailable(""));
        }
        let market_name = &req.market;
        if !self.markets.contains_key(market_name) {
            return Err(Status::invalid_argument("invalid market"));
        }
        let orders = &req.orders;
        if req.reset {
            for order_req in orders {
                if market_name != &order_req.market {
                    return Err(Status::invalid_argument("inconsistent order markets"));
                }
                let market = self.markets.get_mut(market_name).unwrap();
                let persistor = if real { &mut self.persistor } else { &mut self.dummy_persistor };
                market.cancel_all_for_user((&mut self.balance_manager).into(), persistor, user_id.to_string());
            }
        }
        let mut result_code = ResultCode::Success;
        let mut error_message = "".to_string();
        let mut order_ids = Vec::with_capacity(orders.len());
        for order_req in orders {
            if market_name != &order_req.market {
                return Err(Status::invalid_argument("inconsistent order markets"));
            }

            match self.put_order(real, order_req, user_id) {
                Ok(order) => order_ids.push(order.id),
                Err(error) => {
                    result_code = ResultCode::InternalError;
                    error_message = error.to_string();
                    break;
                }
            }
        }
        if real {
            self.append_operation_log(OPERATION_BATCH_ORDER_PUT, &req, user_id);
        }
        Ok(BatchOrderPutResponse {
            result_code: result_code.into(),
            error_message,
            order_ids,
        })
    }

    pub fn order_cancel(&mut self, real: bool, req: OrderCancelRequest, user_id: Uuid) -> Result<OrderInfo, tonic::Status> {
        if !self.check_service_available() {
            return Err(Status::unavailable(""));
        }
        let market = self
            .markets
            .get_mut(&req.market)
            .ok_or_else(|| Status::invalid_argument("invalid market"))?;
        let order = market
            .get(req.order_id)
            .ok_or_else(|| Status::invalid_argument("invalid order_id"))?;
        if !order.user.eq(&user_id) {
            return Err(Status::invalid_argument("invalid user"));
        }
        let balance_manager = &mut self.balance_manager;
        //let persistor = self.get_persistor(real);
        let persistor = if real { &mut self.persistor } else { &mut self.dummy_persistor };
        market.cancel(balance_manager.into(), persistor, order.id);
        if real {
            self.append_operation_log(OPERATION_ORDER_CANCEL, &req, user_id);
        }
        Ok(OrderInfo::from(order))
    }

    pub fn order_cancel_all(
        &mut self,
        real: bool,
        req: OrderCancelAllRequest,
        user_id: Uuid,
    ) -> Result<OrderCancelAllResponse, tonic::Status> {
        if !self.check_service_available() {
            return Err(Status::unavailable(""));
        }
        let market = self
            .markets
            .get_mut(&req.market)
            .ok_or_else(|| Status::invalid_argument("invalid market"))?;
        //let persistor = self.get_persistor(real);
        let persistor = if real { &mut self.persistor } else { &mut self.dummy_persistor };
        let total = market.cancel_all_for_user((&mut self.balance_manager).into(), persistor, user_id.to_string()) as u32;
        if real {
            self.append_operation_log(OPERATION_ORDER_CANCEL_ALL, &req, user_id);
        }
        Ok(OrderCancelAllResponse { total })
    }

    pub async fn debug_dump(&self, _req: DebugDumpRequest) -> Result<DebugDumpResponse, Status> {
        async {
            let mut connection = ConnectionType::connect(&self.settings.db_log).await?;
            crate::persist::dump_to_db(&mut connection, current_timestamp() as i64, self).await
        }
        .await
        .map_err(|err| Status::unknown(format!("{}", err)))?;
        Ok(DebugDumpResponse {})
    }

    fn reset_state(&mut self) {
        self.sequencer.reset();
        for market in self.markets.values_mut() {
            market.reset();
        }
        //self.log_handler.reset();
        self.update_controller.reset();
        self.balance_manager.reset();
        //Ok(())
    }

    pub async fn market_reload(&mut self, from_scratch: bool) -> Result<(), Status> {
        if from_scratch {
            self.market_load_cfg.reset_load_time();
        }

        //assets and markets can be updated respectively, and must be handled one
        //after another
        let new_assets = self
            .market_load_cfg
            .load_asset_from_db(&self.db_pool)
            .await
            .map_err(|e| tonic::Status::internal(e.to_string()))?;

        self.balance_manager.asset_manager.append(&new_assets);

        let new_markets = self
            .market_load_cfg
            .load_market_from_db(&self.db_pool)
            .await
            .map_err(|e| tonic::Status::internal(e.to_string()))?;

        for entry in new_markets.into_iter() {
            let handle_ret = if self.markets.get(&entry.name).is_none() {
                market::Market::new(&entry, &self.settings, &self.balance_manager).map(|mk| {
                    self.markets.insert(entry.name.clone(), mk);
                    self.asset_market_names.insert((entry.base, entry.quote), entry.name);
                })
            } else {
                Err(anyhow!("market {} is duplicated", entry.name))
            };

            if let Err(e) = handle_ret {
                log::error!("On handle append market fail: {}", e);
            }
        }

        Ok(())
    }

    pub fn transfer(&mut self, real: bool, req: TransferRequest, user_id: Uuid) -> Result<TransferResponse, Status> {
        if !self.check_service_available() {
            return Err(Status::unavailable(""));
        }

        let asset = &req.asset;
        if !self.balance_manager.asset_manager.asset_exist(asset) {
            return Err(Status::invalid_argument("invalid asset"));
        }

        let to_user_id = req.to.clone();

        let balance_manager = &self.balance_manager;
        let balance_from = balance_manager.get(user_id, BalanceType::AVAILABLE, asset);

        let zero = Decimal::from(0);
        let delta = Decimal::from_str(&req.delta).unwrap_or(zero);

        if delta <= zero || delta > balance_from {
            return Ok(TransferResponse {
                success: false,
                asset: asset.to_owned(),
                balance_from: balance_from.to_string(),
            });
        }

        let prec = self.balance_manager.asset_manager.asset_prec_show(asset);
        let change = delta.round_dp(prec);

        let business = "transfer";
        let timestamp = FTimestamp(current_timestamp());
        let business_id = (timestamp.0 * 1_000_f64) as u64; // milli-seconds
        let detail_json: serde_json::Value = if req.memo.is_empty() {
            json!({})
        } else {
            serde_json::from_str(req.memo.as_str()).map_err(|_| Status::invalid_argument("invalid memo"))?
        };

        // Get market price of requested base asset and quote asset of USDT.
        let market_price = self
            .asset_market_names
            .get(&(asset.to_owned(), "USDT".to_owned()))
            .map_or(Decimal::zero(), |market_name| self.markets.get(market_name).unwrap().price);
        let persistor = if real { &mut self.persistor } else { &mut self.dummy_persistor };
        self.update_controller
            .update_user_balance(
                &mut self.balance_manager,
                persistor,
                BalanceUpdateParams {
                    balance_type: BalanceType::AVAILABLE,
                    business_type: BusinessType::Transfer,
                    user_id,
                    asset: asset.to_owned(),
                    business: business.to_owned(),
                    business_id,
                    market_price,
                    change: -change,
                    detail: detail_json.clone(),
                },
            )
            .map_err(|e| Status::invalid_argument(format!("{}", e)))?;

        let persistor = if real { &mut self.persistor } else { &mut self.dummy_persistor };
        self.update_controller
            .update_user_balance(
                &mut self.balance_manager,
                persistor,
                BalanceUpdateParams {
                    balance_type: BalanceType::AVAILABLE,
                    business_type: BusinessType::Transfer,
                    user_id: to_user_id.parse().unwrap(),
                    asset: asset.to_owned(),
                    business: business.to_owned(),
                    business_id,
                    market_price: Decimal::zero(),
                    change,
                    detail: detail_json,
                },
            )
            .map_err(|e| Status::invalid_argument(format!("{}", e)))?;

        if real {
            self.persistor.put_transfer(models::InternalTx {
                time: timestamp.into(),
                user_from: user_id.to_string(),
                user_to: to_user_id,
                asset: asset.to_owned(),
                amount: change,
            });

            self.append_operation_log(OPERATION_TRANSFER, &req, user_id);
        }

        Ok(TransferResponse {
            success: true,
            asset: asset.to_owned(),
            balance_from: (balance_from - change).to_string(),
        })
    }

    pub async fn debug_reset(&mut self, _req: DebugResetRequest) -> Result<DebugResetResponse, Status> {
        async {
            log::info!("do full reset: memory and db");
            self.reset_state();
            // waiting for pending db writes
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            /*
            notice: migration in sqlx is rather crude. It simply add operating records into
            _sqlx_migrations table and once an operating is recorded, it never try to reapply
            corresponding actions (even the table has been drop accidentily).

            and it is still not handle some edge case well: like create a the existed seq
            in postgresql cause an error from migrator

            that means you can not simply drop some table (because the migrations recorded
            in table _sqlx_migrations forbid it reroll,
            you can not even drop the all the talbes include _sqlx_migrations because some
            other object left in database will lead migrator fail ...

            now the way i found is drop and re-create the database ..., maybe a throughout
            dropping may also work?
            */
            /*
            let drop_cmd = format!("drop table if exists _sqlx_migrations, {}, {}, {}, {}, {}, {}, {}",
                tablenames::BALANCEHISTORY,
                tablenames::BALANCESLICE,
                tablenames::SLICEHISTORY,
                tablenames::OPERATIONLOG,
                tablenames::ORDERHISTORY,
                tablenames::USERTRADE,
                tablenames::ORDERSLICE);
            */
            // sqlx::query seems unable to handle multi statements, so `execute` is used here

            let db_str = self.settings.db_log.clone();
            let down_cmd = include_str!("../../migrations/reset/down.sql");
            let up_cmd = include_str!("../../migrations/reset/up.sql");
            let mut connection = ConnectionType::connect(&db_str).await?;
            connection.execute(down_cmd).await?;
            let mut connection = ConnectionType::connect(&db_str).await?;
            connection.execute(up_cmd).await?;

            //To workaround https://github.com/launchbadge/sqlx/issues/954: migrator is not Send
            let db_str = self.settings.db_log.clone();
            let thr_handle = std::thread::spawn(move || {
                let rt: tokio::runtime::Runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("build another runtime for migration");

                let ret = rt.block_on(async move {
                    let mut conn = ConnectionType::connect(&db_str).await?;
                    crate::persist::MIGRATOR.run(&mut conn).await?;
                    crate::message::persist::MIGRATOR.run(&mut conn).await
                });

                log::info!("migration task done");
                ret
            });

            tokio::task::spawn_blocking(move || thr_handle.join().unwrap()).await.unwrap()
        }
        .await
        .map_err(|err| Status::unknown(format!("{}", err)))?;
        Ok(DebugResetResponse {})
    }

    pub async fn debug_reload(&mut self, _req: DebugReloadRequest) -> Result<DebugReloadResponse, Status> {
        async {
            self.reset_state();
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let mut connection = ConnectionType::connect(&self.settings.db_log).await?;
            crate::persist::init_from_db(&mut connection, self).await
        }
        .await
        .map_err(|err| Status::unknown(format!("{}", err)))?;
        Ok(DebugReloadResponse {})
    }

    // reload 1000 in batch and replay
    pub fn replay(&mut self, user_id: Uuid, method: &str, params: &str) -> SimpleResult {
        match method {
            OPERATION_BALANCE_UPDATE => {
                self.update_balance(false, serde_json::from_str(params)?, user_id)?;
            }
            OPERATION_ORDER_CANCEL => {
                self.order_cancel(false, serde_json::from_str(params)?, user_id)?;
            }
            OPERATION_ORDER_CANCEL_ALL => {
                self.order_cancel_all(false, serde_json::from_str(params)?, user_id)?;
            }
            OPERATION_ORDER_PUT => {
                self.order_put(false, serde_json::from_str(params)?, user_id)?;
            }
            OPERATION_BATCH_ORDER_PUT => {
                self.batch_order_put(false, serde_json::from_str(params)?, user_id)?;
            }
            OPERATION_TRANSFER => {
                self.transfer(false, serde_json::from_str(params)?, user_id)?;
            }
            _ => bail!("invalid operation {}", method),
        }
        Ok(())
    }
    fn put_order(&mut self, real: bool, req: &OrderPutRequest, user_id: Uuid) -> Result<Order, Status> {
        if !self.markets.contains_key(&req.market) {
            return Err(Status::invalid_argument("invalid market"));
        }
        let total_order_num: usize = self.markets.iter().map(|(_, market)| market.get_order_num_of_user(&user_id)).sum();
        debug_assert!(total_order_num <= self.settings.user_order_num_limit);
        if total_order_num == self.settings.user_order_num_limit {
            return Err(Status::unavailable("too many active orders for user"));
        }
        let market = self.markets.get_mut(&req.market).unwrap();
        let balance_manager = &mut self.balance_manager;
        let update_controller = &mut self.update_controller;
        let persistor = if real { &mut self.persistor } else { &mut self.dummy_persistor };
        let order_input = OrderInput::try_from(req.clone()).map_err(|e| Status::invalid_argument(format!("invalid decimal {}", e)))?;
        market
            .put_order(
                &mut self.sequencer,
                balance_manager.into(),
                update_controller,
                persistor,
                order_input,
                user_id,
            )
            .map_err(|e| Status::unknown(format!("{}", e)))
    }
    fn append_operation_log<Operation>(&mut self, method: &str, req: &Operation, user_id: Uuid)
    where
        Operation: Serialize,
    {
        let params = serde_json::to_string(req).unwrap();
        let operation_log = models::OperationLog {
            id: self.sequencer.next_operation_log_id() as i64,
            user_id: user_id.to_string(),
            time: FTimestamp(current_timestamp()).into(),
            method: method.to_owned(),
            params,
        };
        (*self.log_handler).append_operation_log(operation_log).ok();
    }
}

#[cfg(sqlxverf)]
fn sqlverf_clear_slice() -> impl std::any::Any {
    sqlx::query!("drop table if exists balance_history, balance_slice")
}
