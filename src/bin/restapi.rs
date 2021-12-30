use actix_web::{dev::ServiceRequest, App, Error, HttpServer};
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};
use actix_web_httpauth::extractors::AuthenticationError;
use actix_web_httpauth::middleware::HttpAuthentication;
use dingir_exchange::matchengine::authentication;
use dingir_exchange::restapi::manage::market;
use dingir_exchange::restapi::personal_history::{my_internal_txs, my_orders};
use dingir_exchange::restapi::public_history::{order_trades, recent_trades};
use dingir_exchange::restapi::state::{AppCache, AppState};
use dingir_exchange::restapi::tradingview::{chart_config, history, search_symbols, symbols, ticker, unix_timestamp};
use fluidex_common::non_blocking_tracing;
use paperclip::actix::web::{self, HttpResponse};
use paperclip::actix::{api_v2_operation, OpenApiExt};
use sqlx::postgres::Postgres;
use sqlx::Pool;
use std::convert::TryFrom;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    let _guard = non_blocking_tracing::setup();

    let db_url = dingir_exchange::config::Settings::new().db_history;
    log::debug!("Prepared DB connection: {}", &db_url);

    let config = dingir_exchange::restapi::config::Settings::new();
    let manage_channel = if let Some(ep_str) = &config.manage_endpoint {
        log::info!("Connect to manage channel {}", ep_str);
        Some(
            tonic::transport::Endpoint::try_from(ep_str.clone())
                .ok()
                .unwrap()
                .connect()
                .await
                .unwrap(),
        )
    } else {
        None
    };

    let user_map = web::Data::new(AppState {
        manage_channel,
        db: Pool::<Postgres>::connect(&db_url).await.unwrap(),
        config,
    });

    let workers = user_map.config.workers;

    let server = HttpServer::new(move || {
        App::new()
            .wrap(HttpAuthentication::bearer(validator))
            .app_data(user_map.clone())
            .app_data(AppCache::new())
            .wrap_api()
            .service(
                web::scope("/api/exchange/panel")
                    .route("/ping", web::get().to(ping))
                    .route("/recenttrades/{market}", web::get().to(recent_trades))
                    .route("/ordertrades/{market}/{order_id}", web::get().to(order_trades))
                    .route("/closedorders/{market}", web::get().to(my_orders))
                    .route("/internal_txs", web::get().to(my_internal_txs))
                    .route("/ticker_{ticker_inv}/{market}", web::get().to(ticker))
                    .service(
                        web::scope("/tradingview")
                            .route("/time", web::get().to(unix_timestamp))
                            .route("/config", web::get().to(chart_config))
                            .route("/search", web::get().to(search_symbols))
                            .route("/symbols", web::get().to(symbols))
                            .route("/history", web::get().to(history)),
                    )
                    .service(if user_map.manage_channel.is_some() {
                        web::scope("/manage").service(
                            web::scope("/market")
                                .route("/reload", web::post().to(market::reload))
                                .route("/tradepairs", web::post().to(market::add_pair))
                                .route("/assets", web::post().to(market::add_assets)),
                        )
                    } else {
                        web::scope("/manage")
                            .service(web::resource("/").to(|| HttpResponse::Forbidden().body(String::from("No manage endpoint"))))
                    }),
            )
            .with_json_spec_at("/api/spec")
            .build()
    });

    let server = match workers {
        Some(wr) => server.workers(wr),
        None => server,
    };

    server.bind("0.0.0.0:50053")?.run().await
}

async fn validator(req: ServiceRequest, credentials: BearerAuth) -> Result<ServiceRequest, Error> {
    let config = req.app_data::<Config>().cloned().unwrap_or_default();

    match authentication::rest_auth(req, credentials.token()) {
        Ok(res) => Ok(res),
        Err(_) => Err(AuthenticationError::from(config).into()),
    }
}

#[api_v2_operation]
async fn ping() -> Result<&'static str, actix_web::Error> {
    Ok("pong")
}
