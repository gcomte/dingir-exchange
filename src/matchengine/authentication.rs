use crate::config::Settings;
use actix_web::dev::ServiceRequest;
use actix_web::HttpMessage;
use jsonwebtoken::{decode, Algorithm, DecodingKey, TokenData, Validation};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::time::{SystemTime, UNIX_EPOCH};
use tonic::{Request, Status};
use uuid::Uuid;

const MARKET_RELOAD_ENDPOINT: &str = "/api/exchange/panel/manage/market/reload";
const ONE_HOUR_IN_SECS: u64 = 60 * 60;

fn validate_jwt(jwt: &str) -> Result<TokenData<Claims>, Box<dyn Error + Send + Sync>> {
    let settings = Settings::new();
    log::debug!("Keycloak public key: {}", settings.keycloak_pubkey);
    log::debug!("Authentication token: {}", &jwt);

    let token = decode::<Claims>(
        jwt,
        &DecodingKey::from_rsa_pem(settings.keycloak_pubkey.as_ref()).unwrap(),
        &Validation::new(Algorithm::RS512),
    );

    let token = match token {
        Ok(t) => t,
        Err(err) => {
            log::warn!("KeyCloak authentication failed: {}", err);
            return Err(Box::new(err));
        }
    };

    // Double check time-based validity of token
    if !token.claims.ensure_timely_boundaries() {
        return Err(From::from("Token does not fulfill timely boundaries."));
    }

    Ok(token)
}

pub fn grpc_interceptor(mut req: Request<()>) -> Result<Request<()>, Status> {
    if let Some(token) = req.metadata().get("authorization") {
        let token = token.to_str();
        let jwt = match token {
            Ok(jwt) => jwt.replace("Bearer ", ""),
            Err(err) => return Err(Status::unauthenticated(err.to_string())),
        };

        let claims = match validate_jwt(&jwt) {
            Ok(token_data) => token_data,
            Err(err) => return Err(Status::unauthenticated(err.to_string())),
        };

        // Add extensions to request
        req.extensions_mut().insert(get_user_extension(claims));
    }

    Ok(req)
}

pub fn rest_auth<'a>(req: ServiceRequest, jwt: &'a str) -> Result<ServiceRequest, (actix_web::Error, ServiceRequest)> {
    // let jwt = jwt.replace("Bearer ", ""); // already done by actix-web
    // let token = validate_jwt(jwt)?;
    // Manually match the token
    let token = match validate_jwt(jwt) {
        Ok(token_data) => token_data,
        Err(err) => {
            return Err((actix_web::Error::from(std::io::Error::new(
                std::io::ErrorKind::Other,
                err.to_string(),
            )), req));
        }
    };

    // Add extensions to request
    req.extensions_mut().insert(get_user_extension(token));

    // reload calls the GRPC interface and must therefore forward the JWT
    if req.path().eq(MARKET_RELOAD_ENDPOINT) {
        req.extensions_mut().insert(JwtExtension { jwt: jwt.to_string() });
    }

    Ok(req)
}

fn get_user_extension(token: TokenData<Claims>) -> UserExtension {
    let settings = Settings::new();

    UserExtension {
        is_admin: token.claims.has_role(&settings.keycloak_admin_role),
        is_deposit_admin: token.claims.has_role(&settings.keycloak_deposit_admin_role),
        is_withdrawal_admin: token.claims.has_role(&settings.keycloak_withdrawal_admin_role),
        user_id: token.claims.sub,
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    exp: u64,                          // Expiration time (as UTC timestamp). JWT library automatically checks expiry.
    iat: u64,                          // Issued at (as UTC timestamp)
    sub: Uuid,                         // Subject (whom token refers to) --> user id
    realm_access: Option<RealmAccess>, // Roles
}

impl Claims {
    pub fn ensure_timely_boundaries(&self) -> bool {
        self.validate_issue_date() && self.validate_expiry_date()
    }

    fn validate_issue_date(&self) -> bool {
        if self.iat < get_current_unix_timestamp() - ONE_HOUR_IN_SECS {
            log::warn!(
                "User {}: JWT iat [issued at] was over an hour ago! [ iat = {}, current timestamp = {}",
                self.sub,
                self.iat,
                get_current_unix_timestamp()
            );
            return false;
        }

        true
    }

    fn validate_expiry_date(&self) -> bool {
        if self.exp > get_current_unix_timestamp() + ONE_HOUR_IN_SECS {
            log::warn!(
                "User {}: JWT exp [expiration date] is more than one hour in the future! [ exp = {}, current timestamp = {}",
                self.sub,
                self.exp,
                get_current_unix_timestamp()
            );
            return false;
        }

        true
    }

    fn has_role(&self, kc_role: &str) -> bool {
        if let Some(ra) = &self.realm_access {
            return ra.roles.iter().any(|role| role.eq(kc_role));
        }

        false
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct RealmAccess {
    roles: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct JwtExtension {
    pub jwt: String,
}

#[derive(Debug, Clone)]
pub struct UserExtension {
    pub user_id: Uuid,
    pub is_admin: bool,
    pub is_deposit_admin: bool,
    pub is_withdrawal_admin: bool,
}

fn get_current_unix_timestamp() -> u64 {
    let start = SystemTime::now();
    start.duration_since(UNIX_EPOCH).expect("Time went backwards").as_secs()
}
