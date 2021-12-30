use crate::restapi::{state, types};
use crate::storage;
use actix_web::error::InternalError;
use actix_web::http::StatusCode;
use futures::future::OptionFuture;
use orchestra::rpc::exchange::*;
use paperclip::actix::api_v2_operation;
use paperclip::actix::web;

pub mod market {
    use super::*;
    use crate::matchengine::authentication::JwtExtension;
    use actix_web::HttpRequest;
    use tonic::metadata::MetadataValue;
    use tonic::IntoRequest;

    async fn do_reload(jwt: &str, app_state: &state::AppState) -> Result<&'static str, actix_web::Error> {
        let mut rpc_cli = matchengine_client::MatchengineClient::new(app_state.manage_channel.as_ref().unwrap().clone());

        let reload_req = ReloadMarketsRequest { from_scratch: false };
        let mut grpc_req = reload_req.into_request();

        let auth_string = format!("Bearer {}", jwt);
        grpc_req
            .metadata_mut()
            .insert("authorization", MetadataValue::from_str(&auth_string).unwrap());

        if let Err(e) = rpc_cli.reload_markets(grpc_req).await {
            return Err(InternalError::new(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR).into());
        }

        Ok("done")
    }

    #[api_v2_operation]
    pub async fn add_assets(
        req: web::Json<types::NewAssetReq>,
        app_state: web::Data<state::AppState>,
    ) -> Result<&'static str, actix_web::Error> {
        let assets_req = req.into_inner();

        for asset in &assets_req.assets {
            log::debug!("Add asset {:?}", asset);
            if let Err(e) = storage::config::persist_asset_to_db(&app_state.db, asset, false).await {
                return Err(InternalError::new(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR).into());
            }
        }

        if !assets_req.not_reload {
            do_reload(&assets_req.jwt, &app_state.into_inner()).await
        } else {
            Ok("done")
        }
    }

    #[api_v2_operation]
    pub async fn reload(req: HttpRequest, app_state: web::Data<state::AppState>) -> Result<&'static str, actix_web::Error> {
        let jwt = req.extensions().get::<JwtExtension>().unwrap().clone().jwt;
        do_reload(&jwt, &app_state.into_inner()).await
    }

    #[api_v2_operation]
    pub async fn add_pair(
        req: web::Json<types::NewTradePairReq>,
        app_state: web::Data<state::AppState>,
    ) -> Result<&'static str, actix_web::Error> {
        let trade_pair = req.into_inner();

        if let Some(asset) = trade_pair.asset_base.as_ref() {
            if asset.id != trade_pair.market.base {
                return Err(InternalError::new("Base asset not match".to_owned(), StatusCode::BAD_REQUEST).into());
            }
        }

        if let Some(asset) = trade_pair.asset_quote.as_ref() {
            if asset.id != trade_pair.market.quote {
                return Err(InternalError::new("Quote asset not match".to_owned(), StatusCode::BAD_REQUEST).into());
            }
        }

        if let Some(Err(e)) = OptionFuture::from(
            trade_pair
                .asset_base
                .as_ref()
                .map(|base_asset| storage::config::persist_asset_to_db(&app_state.db, base_asset, false)),
        )
        .await
        {
            return Err(InternalError::new(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR).into());
        }

        if let Some(Err(e)) = OptionFuture::from(
            trade_pair
                .asset_quote
                .as_ref()
                .map(|quote_asset| storage::config::persist_asset_to_db(&app_state.db, quote_asset, false)),
        )
        .await
        {
            return Err(InternalError::new(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR).into());
        }

        if let Err(e) = storage::config::persist_market_to_db(&app_state.db, &trade_pair.market).await {
            return Err(InternalError::new(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR).into());
        }

        if !trade_pair.not_reload {
            let jwt = trade_pair.into_request().extensions().get::<JwtExtension>().unwrap().clone().jwt;
            do_reload(&jwt, &app_state.into_inner()).await
        } else {
            Ok("done")
        }
    }
}
