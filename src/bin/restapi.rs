use actix_web::{dev::ServiceRequest, App, Error, HttpMessage, HttpServer};
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};
use actix_web_httpauth::extractors::AuthenticationError;
use actix_web_httpauth::middleware::HttpAuthentication;
use dingir_exchange::matchengine::authentication;
use dingir_exchange::matchengine::authentication::UserExtension;
use dingir_exchange::restapi::manage::market;
use dingir_exchange::restapi::personal_history::my_orders;
use dingir_exchange::restapi::public_history::{order_trades, recent_trades};
use dingir_exchange::restapi::state::{AppCache, AppState};
use dingir_exchange::restapi::tradingview::{chart_config, history, search_symbols, symbols, ticker, unix_timestamp};
use fluidex_common::non_blocking_tracing;
use paperclip::actix::web::{self, HttpResponse};
use paperclip::actix::{api_v2_operation, OpenApiExt};
use sqlx::postgres::Postgres;
use sqlx::Pool;
use std::convert::TryFrom;

const PUBLIC_ENDPOINTS: [&str; 6] = [
    "/api/exchange/panel/ping",
    "/api/exchange/panel/recenttrades",
    "/api/exchange/panel/ordertrades",
    "/api/exchange/panel/ticker_",
    "/api/exchange/panel/tradingview",
    "/api/spec",
];
const ADMIN_ENDPOINTS: [&str; 1] = ["/api/exchange/panel/manage"];

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
                    .route("/ping", web::get().to(ping)) // ping that doesn't need auth
                    .route("/authping", web::get().to(ping)) // ping that needs auth
                    .route("/recenttrades/{market}", web::get().to(recent_trades))
                    .route("/ordertrades/{market}/{order_id}", web::get().to(order_trades))
                    .route("/closedorders/{market}", web::get().to(my_orders))
                    .route("/ticker_{ticker_inv}/{market}", web::get().to(ticker))
                    .service(
                        web::scope("/tradingview")
                            .route("/time", web::get().to(unix_timestamp))
                            .route("/config", web::get().to(chart_config))
                            .route("/search", web::get().to(search_symbols))
                            .route("/symbols", web::get().to(symbols))
                            .route("/history", web::get().to(history)),                )
                    .service(if user_map.manage_channel.is_some() {
                        web::scope("/manage").service(
                            web::scope("/market")
                                .route("/reload", web::get().to(market::reload))
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
    for public_endpoint in PUBLIC_ENDPOINTS.iter() {
        if req.path().starts_with(public_endpoint) {
            return Ok(req);
        }
    }

    let config = req.app_data::<Config>().cloned().unwrap_or_default();
    let req = match authentication::rest_auth(req, credentials.token()) {
        Ok(req) => req,
        Err(_) => {
            return Err(AuthenticationError::from(config).into());
        }
    };

    for admin_endpoint in ADMIN_ENDPOINTS.iter() {
        if req.path().starts_with(admin_endpoint) {
            rest_block_non_admins(&req)?;
        }
    }

    Ok(req)
}

fn rest_block_non_admins(req: &ServiceRequest) -> Result<(), Error> {
    if !req.extensions().get::<UserExtension>().unwrap().is_admin {
        log::warn!(
            "Reject REST call; User {} does not have admin rights.",
            req.extensions().get::<UserExtension>().unwrap().user_id
        );
        let config = req.app_data::<Config>().cloned().unwrap_or_default();
        return Err(AuthenticationError::from(config).into());
    }

    Ok(())
}

#[api_v2_operation]
async fn ping() -> Result<&'static str, actix_web::Error> {
    Ok("pong")
}
