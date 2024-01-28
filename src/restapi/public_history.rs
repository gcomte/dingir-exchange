use crate::models::tablenames::{MARKETTRADE, USERTRADE};
use crate::models::{self, TimestampDbType};
use crate::restapi::errors::RpcError;
use crate::restapi::state::AppState;
use crate::restapi::types;
use actix_web::HttpResponse;
use chrono::{DateTime, SecondsFormat, Utc};
use core::cmp::min;
use paperclip::actix::{api_v2_operation, HttpResponseWrapper};
use paperclip::actix::web::{self, HttpRequest, Json};
use sqlx::types::Decimal;

fn check_market_exists(_market: &str) -> bool {
    // TODO
    true
}

// #[api_v2_operation]
// pub async fn recent_trades(req: HttpRequest, data: web::Data<AppState>) -> Result<Json<Vec<models::MarketTrade>>, actix_web::Error> {
pub async fn recent_trades(req: HttpRequest, data: web::Data<AppState>) -> HttpResponseWrapper {
    let market = req.match_info().get("market").unwrap();
    let qstring = qstring::QString::from(req.query_string());
    let limit = min(100, qstring.get("limit").unwrap_or_default().parse::<usize>().unwrap_or(20));
    log::debug!("recent_trades market {} limit {}", market, limit);
    if !check_market_exists(market) {
        // return Err(RpcError::bad_request("invalid market").into());
        return HttpResponseWrapper(HttpResponse::BadRequest().body("invalid market"));
    }

    // TODO: this API result should be cached, either in-memory or using redis

    // Here we use the kline trade table, which is more market-centric
    // and more suitable for fetching latest trades on a market.
    // models::UserTrade is designed for a user to fetch his trades.

    let sql_query = format!("select * from {} where market = $1 order by time desc limit {}", MARKETTRADE, limit);

    // let trades: Vec<models::MarketTrade> = sqlx::query_as(&sql_query)
    //     .bind(market)
    //     .fetch_all(&data.db)
    //     .await
    //     .map_err(|err| actix_web::Error::from(RpcError::from(err)));
    let result: Result<Vec<models::MarketTrade>, sqlx::Error> = sqlx::query_as(sql_query.as_str())
        .bind(market)
        .fetch_all(&data.db)
        .await;

    match result {
        Ok(trades) => {
            log::debug!("query {} recent_trades records", trades.len());  
            HttpResponseWrapper(HttpResponse::Ok().json(trades))

        },
        Err(_) => HttpResponseWrapper(HttpResponse::BadRequest().body("invalid market")),
    }

    // log::debug!("query {} recent_trades records", trades.len());
    // Ok(Json(trades))
    // HttpResponseWrapper(HttpResponse::Ok().json(trades))

}

#[derive(sqlx::FromRow, Debug, Clone)]
struct QueriedUserTrade {
    pub time: TimestampDbType,
    pub user_id: String,
    pub trade_id: i64,
    pub order_id: i64,
    pub price: Decimal,
    pub amount: Decimal,
    pub quote_amount: Decimal,
    pub fee: Decimal,
}

#[cfg(sqlxverf)]
fn sqlverf_ticker() -> impl std::any::Any {
    sqlx::query_as!(
        QueriedUserTrade,
        "select time, user_id, trade_id, order_id,
        price, amount, quote_amount, fee
        from user_trade where market = $1 and order_id = $2
        order by trade_id, time asc",
        "USDT_ETH",
        10000,
    )
}

#[api_v2_operation]
pub async fn order_trades(
    app_state: web::Data<AppState>,
    path: web::Path<(String, i64)>,
) -> Result<Json<types::OrderTradeResult>, actix_web::Error> {
    let (market_name, order_id): (String, i64) = path.into_inner();
    log::debug!("order_trades market {} order_id {}", market_name, order_id);

    let sql_query = format!(
        "
    select time, user_id, trade_id, order_id,
    price, amount, quote_amount, fee
    from {} where market = $1 and order_id = $2
    order by trade_id, time asc",
        USERTRADE
    );

    let trades: Vec<QueriedUserTrade> = sqlx::query_as(&sql_query)
        .bind(market_name)
        .bind(order_id)
        .fetch_all(&app_state.db)
        .await
        .map_err(|err| actix_web::Error::from(RpcError::from(err)))?;

    Ok(Json(types::OrderTradeResult {
        trades: trades
            .into_iter()
            .map(|v| types::MarketTrade {
                trade_id: v.trade_id,
                time: DateTime::<Utc>::from_utc(v.time, Utc).to_rfc3339_opts(SecondsFormat::Secs, true),
                amount: v.amount.to_string(),
                quote_amount: v.quote_amount.to_string(),
                price: v.price.to_string(),
                fee: v.fee.to_string(),
            })
            .collect(),
    }))
}
