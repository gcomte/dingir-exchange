use crate::matchengine::authentication::UserExtension;
use crate::models::tablenames::ORDERHISTORY;
use crate::models::{OrderHistory, TimestampDbType};
use crate::restapi::errors::RpcError;
use crate::restapi::state::AppState;
use core::cmp::min;
use paperclip::actix::web::{self, HttpRequest, Json};
use paperclip::actix::{api_v2_operation, Apiv2Schema};
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Serialize, Apiv2Schema)]
pub struct OrderResponse {
    total: i64,
    orders: Vec<OrderHistory>,
}

#[api_v2_operation]
pub async fn my_orders(req: HttpRequest, data: web::Data<AppState>) -> Result<Json<OrderResponse>, actix_web::Error> {
    let market = req.match_info().get("market").unwrap();
    let user_id = req.extensions().get::<UserExtension>().unwrap().user_id;
    let qstring = qstring::QString::from(req.query_string());
    let limit = min(100, qstring.get("limit").unwrap_or_default().parse::<usize>().unwrap_or(20));
    let offset = qstring.get("offset").unwrap_or_default().parse::<usize>().unwrap_or(0);

    let table = ORDERHISTORY;
    let condition = if market == "all" {
        "user_id = $1".to_string()
    } else {
        "market = $1 and user_id = $2".to_string()
    };
    let order_query = format!(
        "select * from {} where {} order by id desc limit {} offset {}",
        table, condition, limit, offset
    );
    let orders: Vec<OrderHistory> = if market == "all" {
        sqlx::query_as(&order_query).bind(user_id.to_string())
    } else {
        sqlx::query_as(&order_query).bind(market).bind(user_id.to_string())
    }
    .fetch_all(&data.db)
    .await
    .map_err(|err| actix_web::Error::from(RpcError::from(err)))?;
    let count_query = format!("select count(*) from {} where {}", table, condition);
    let total: i64 = if market == "all" {
        sqlx::query_scalar(&count_query).bind(user_id.to_string())
    } else {
        sqlx::query_scalar(&count_query).bind(market).bind(user_id.to_string())
    }
    .fetch_one(&data.db)
    .await
    .map_err(|err| actix_web::Error::from(RpcError::from(err)))?;
    Ok(Json(OrderResponse { total, orders }))
}

#[derive(Copy, Clone, Debug, Deserialize, Apiv2Schema)]
pub enum Order {
    #[serde(rename = "lowercase")]
    Asc,
    #[serde(rename = "lowercase")]
    Desc,
}

impl Default for Order {
    fn default() -> Self {
        Self::Desc
    }
}

#[derive(Copy, Clone, Debug, Deserialize, Apiv2Schema)]
pub enum Side {
    #[serde(rename = "lowercase")]
    From,
    #[serde(rename = "lowercase")]
    To,
    #[serde(rename = "lowercase")]
    Both,
}

impl Default for Side {
    fn default() -> Self {
        Self::Both
    }
}

fn u64_timestamp_deserializer<'de, D>(deserializer: D) -> Result<Option<TimestampDbType>, D::Error>
where
    D: Deserializer<'de>,
{
    let timestamp = Option::<u64>::deserialize(deserializer)?;
    Ok(timestamp.map(|ts| TimestampDbType::from_timestamp(ts as i64, 0)))
}

const fn default_limit() -> usize {
    20
}
const fn default_zero() -> usize {
    0
}
