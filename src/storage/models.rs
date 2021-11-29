use crate::types::OrderSide;
use chrono::NaiveDateTime;
use paperclip::actix::Apiv2Schema;
use serde::ser::Serializer;
use serde::{Deserialize, Serialize};

pub type DecimalDbType = fluidex_common::rust_decimal::Decimal;
// https://github.com/launchbadge/sqlx/blob/master/sqlx-core/src/postgres/types/mod.rs
// pub type TimestampDbType = DateTime<Utc>;
pub type TimestampDbType = NaiveDateTime;

/// Helper trait add serde support to `TimestampDbType` using milliseconds.
pub trait DateTimeMilliseconds: Sized {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer;
}

impl DateTimeMilliseconds for TimestampDbType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i64(self.timestamp_millis())
    }
}

pub mod tablenames {
    pub const ASSET: &str = "asset";
    pub const MARKET: &str = "market";
    pub const BALANCEHISTORY: &str = "balance_history";
    pub const ORDERHISTORY: &str = "order_history";
    pub const USERTRADE: &str = "user_trade";
    pub const OPERATIONLOG: &str = "operation_log";
    pub const ORDERSLICE: &str = "order_slice";
    pub const BALANCESLICE: &str = "balance_slice";
    pub const SLICEHISTORY: &str = "slice_history";
    pub const MARKETTRADE: &str = "market_trade";
    pub const INTERNALTX: &str = "internal_tx";
}

use tablenames::*;

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct AssetDesc {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub precision_stor: i16,
    pub precision_show: i16,
    pub create_time: Option<TimestampDbType>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct MarketDesc {
    pub id: i32,
    pub create_time: Option<TimestampDbType>,
    pub base_asset: String,
    pub quote_asset: String,
    pub precision_amount: i16,
    pub precision_price: i16,
    pub precision_fee: i16,
    pub min_amount: DecimalDbType,
    pub market_name: Option<String>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct BalanceHistory {
    //for renaming, add #[sqlx(type_name = "<row name>")] in corresponding
    //field (not like diesel imply within the derive macro)
    //pub id: i64,
    pub time: TimestampDbType,
    pub user_id: i32,
    pub business_id: i64,
    pub asset: String,
    pub business: String,
    pub market_price: DecimalDbType,
    pub change: DecimalDbType,
    pub balance: DecimalDbType,
    pub balance_available: DecimalDbType,
    pub balance_frozen: DecimalDbType,
    // TODO: change it to jsonb
    pub detail: String,
}

#[derive(sqlx::Type, Debug, Clone, Serialize, Deserialize, Apiv2Schema)]
#[sqlx(type_name = "order_status", rename_all = "lowercase")]
pub enum OrderStatus {
    Active,
    Filled,
    Cancelled,
    Expired,
}

#[derive(sqlx::FromRow, Debug, Clone, Serialize, Apiv2Schema)]
pub struct OrderHistory {
    pub id: i64,
    #[serde(with = "DateTimeMilliseconds")]
    pub create_time: TimestampDbType,
    #[serde(with = "DateTimeMilliseconds")]
    pub finish_time: TimestampDbType,
    pub status: OrderStatus,
    pub user_id: i32,
    pub market: String,
    pub order_type: types::OrderType,
    pub order_side: types::OrderSide,
    pub price: DecimalDbType,
    pub amount: DecimalDbType,
    pub taker_fee: DecimalDbType,
    pub maker_fee: DecimalDbType,
    pub finished_base: DecimalDbType,
    pub finished_quote: DecimalDbType,
    pub finished_fee: DecimalDbType,
    pub post_only: bool,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct UserTrade {
    pub time: TimestampDbType,
    pub user_id: i32,
    pub market: String,
    pub trade_id: i64,
    pub order_id: i64,
    pub counter_order_id: i64,
    pub side: i16,
    pub role: i16,
    pub price: DecimalDbType,
    pub amount: DecimalDbType,
    pub quote_amount: DecimalDbType,
    pub fee: DecimalDbType,
    pub counter_order_fee: DecimalDbType,
}

// Can the following struct be auto generated in diesel?
#[derive(sqlx::FromRow, Debug, Clone)]
pub struct OperationLog {
    pub id: i64,
    pub time: TimestampDbType,
    pub method: String,
    // TODO: change it to jsonb
    pub params: String,
}

//Notice this is used for query the full columns but not for insert
#[derive(sqlx::FromRow, Debug, Clone)]
pub struct BalanceSlice {
    pub id: i32,
    pub slice_id: i64, // Unix timestamp
    pub user_id: i32,
    pub asset: String,
    pub t: i16, // Enum: AVAILABLE or FREEZE
    pub balance: DecimalDbType,
}

#[derive(Debug, Clone)]
pub struct BalanceSliceInsert {
    //pub id: i32,
    pub slice_id: i64, // Unix timestamp
    pub user_id: i32,
    pub asset: String,
    pub t: i16, // Enum: AVAILABLE or FREEZE
    pub balance: DecimalDbType,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct OrderSlice {
    pub id: i64,
    pub slice_id: i64,
    // Type enum: MARKET or LIMIT
    pub order_type: types::OrderType,
    pub order_side: types::OrderSide,
    pub create_time: TimestampDbType,
    pub update_time: TimestampDbType,
    pub user_id: i32,
    pub market: String,
    //pub source: String,
    pub price: DecimalDbType,
    pub amount: DecimalDbType,
    pub taker_fee: DecimalDbType,
    pub maker_fee: DecimalDbType,
    pub remain: DecimalDbType,
    pub frozen: DecimalDbType,
    pub finished_base: DecimalDbType,
    pub finished_quote: DecimalDbType,
    pub finished_fee: DecimalDbType,
    pub post_only: bool,
}

// xx_id here means the last persisted entry id
#[derive(sqlx::FromRow, Debug, Clone)]
pub struct SliceHistory {
    pub time: i64,
    pub end_operation_log_id: i64,
    pub end_order_id: i64,
    pub end_trade_id: i64,
}

#[derive(sqlx::FromRow, Debug, Clone, Serialize, Apiv2Schema)]
pub struct MarketTrade {
    #[serde(with = "DateTimeMilliseconds")]
    pub time: TimestampDbType,
    pub market: String,
    pub trade_id: i64,
    pub price: DecimalDbType,
    pub amount: DecimalDbType,
    pub quote_amount: DecimalDbType,
    pub taker_side: OrderSide,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct InternalTx {
    pub time: TimestampDbType,
    pub user_from: i32,
    pub user_to: i32,
    pub asset: String,
    pub amount: DecimalDbType,
    pub signature: Vec<u8>,
}

/*
    Not like diesel, we still need more code for insert action here
    May be we could use macro to save these works
*/
use crate::sqlxextend;
use crate::types;
pub use types::DbType;

/* --------------------- models::InternalTx -----------------------------*/
impl sqlxextend::TableSchemas for InternalTx {
    fn table_name() -> &'static str {
        INTERNALTX
    }
    const ARGN: i32 = 5;
}

impl sqlxextend::BindQueryArg<'_, DbType> for InternalTx {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.time);
        arg.add(self.user_from);
        arg.add(self.user_to);
        arg.add(&self.asset);
        arg.add(self.amount);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for InternalTx {}

/* --------------------- models::BalanceHistory -----------------------------*/
impl sqlxextend::TableSchemas for BalanceHistory {
    fn table_name() -> &'static str {
        BALANCEHISTORY
    }
    const ARGN: i32 = 11;
    fn default_argsn() -> Vec<i32> {
        vec![1]
    }
}

impl sqlxextend::BindQueryArg<'_, DbType> for BalanceHistory {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.time);
        arg.add(self.user_id);
        arg.add(self.business_id);
        arg.add(&self.asset);
        arg.add(&self.business);
        arg.add(&self.market_price);
        arg.add(&self.change);
        arg.add(&self.balance);
        arg.add(&self.balance_available);
        arg.add(&self.balance_frozen);
        arg.add(&self.detail);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for BalanceHistory {}

/* --------------------- models::UserTrade -----------------------------*/
impl sqlxextend::TableSchemas for UserTrade {
    fn table_name() -> &'static str {
        USERTRADE
    }
    const ARGN: i32 = 13;
    fn default_argsn() -> Vec<i32> {
        vec![1]
    }
}

impl sqlxextend::BindQueryArg<'_, DbType> for UserTrade {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.time);
        arg.add(self.user_id);
        arg.add(&self.market);
        arg.add(self.trade_id);
        arg.add(self.order_id);
        arg.add(self.counter_order_id);
        arg.add(self.side);
        arg.add(self.role);
        arg.add(&self.price);
        arg.add(&self.amount);
        arg.add(&self.quote_amount);
        arg.add(&self.fee);
        arg.add(&self.counter_order_fee);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for UserTrade {}

/* --------------------- models::OrderHistory -----------------------------*/
impl sqlxextend::TableSchemas for OrderHistory {
    fn table_name() -> &'static str {
        ORDERHISTORY
    }
    const ARGN: i32 = 16;
    //fn default_argsn() -> Vec<i32>{ vec![1] }
}

impl sqlxextend::BindQueryArg<'_, DbType> for OrderHistory {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.id);
        arg.add(self.create_time);
        arg.add(self.finish_time);
        arg.add(self.user_id);
        arg.add(&self.market);
        arg.add(self.order_type);
        arg.add(self.order_side);
        arg.add(&self.price);
        arg.add(&self.amount);
        arg.add(&self.taker_fee);
        arg.add(&self.maker_fee);
        arg.add(&self.finished_base);
        arg.add(&self.finished_quote);
        arg.add(&self.finished_fee);
        arg.add(&self.status);
        arg.add(&self.post_only);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for OrderHistory {}

/* --------------------- models::OperationLog -----------------------------*/
impl sqlxextend::TableSchemas for OperationLog {
    const ARGN: i32 = 4;
    fn table_name() -> &'static str {
        OPERATIONLOG
    }
}

impl sqlxextend::BindQueryArg<'_, DbType> for OperationLog {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.id);
        arg.add(self.time);
        arg.add(&self.method);
        arg.add(&self.params);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for OperationLog {}

/* --------------------- models::OrderSlice -----------------------------*/

impl sqlxextend::TableSchemas for OrderSlice {
    fn table_name() -> &'static str {
        ORDERSLICE
    }
    const ARGN: i32 = 18;
    //fn default_argsn() -> Vec<i32>{ vec![1] }
}

impl sqlxextend::BindQueryArg<'_, DbType> for OrderSlice {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.id);
        arg.add(self.slice_id);
        arg.add(self.order_type);
        arg.add(self.order_side);
        arg.add(self.create_time);
        arg.add(self.update_time);
        arg.add(self.user_id);
        arg.add(&self.market);
        arg.add(&self.price);
        arg.add(&self.amount);
        arg.add(&self.taker_fee);
        arg.add(&self.maker_fee);
        arg.add(&self.remain);
        arg.add(&self.frozen);
        arg.add(&self.finished_base);
        arg.add(&self.finished_quote);
        arg.add(&self.finished_fee);
        arg.add(&self.post_only);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for OrderSlice {}

/* --------------------- models::BalanceSliceInsert -----------------------------*/

impl sqlxextend::TableSchemas for BalanceSliceInsert {
    fn table_name() -> &'static str {
        BALANCESLICE
    }
    const ARGN: i32 = 5;
    fn default_argsn() -> Vec<i32> {
        vec![1]
    }
}

impl sqlxextend::BindQueryArg<'_, DbType> for BalanceSliceInsert {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.slice_id);
        arg.add(self.user_id);
        arg.add(&self.asset);
        arg.add(self.t);
        arg.add(&self.balance);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for BalanceSliceInsert {}

/* --------------------- models::SliceHistory -----------------------------*/

impl sqlxextend::TableSchemas for SliceHistory {
    fn table_name() -> &'static str {
        SLICEHISTORY
    }
    const ARGN: i32 = 4;
    fn default_argsn() -> Vec<i32> {
        vec![1]
    }
}

impl sqlxextend::BindQueryArg<'_, DbType> for SliceHistory {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.time);
        arg.add(self.end_operation_log_id);
        arg.add(self.end_order_id);
        arg.add(self.end_trade_id);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for SliceHistory {}

/* --------------------- models::MarketTrade -----------------------------*/
impl sqlxextend::TableSchemas for MarketTrade {
    fn table_name() -> &'static str {
        MARKETTRADE
    }
    const ARGN: i32 = 7;
}

impl sqlxextend::BindQueryArg<'_, DbType> for MarketTrade {
    fn bind_args<'g, 'q: 'g>(&'q self, arg: &mut impl sqlx::Arguments<'g, Database = DbType>) {
        arg.add(self.time);
        arg.add(&self.market);
        arg.add(self.trade_id);
        arg.add(self.price);
        arg.add(self.amount);
        arg.add(self.quote_amount);
        arg.add(self.taker_side);
    }
}

impl sqlxextend::SqlxAction<'_, sqlxextend::InsertTable, DbType> for MarketTrade {}
