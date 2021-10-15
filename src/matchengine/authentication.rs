use crate::config::Settings;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tonic::{Request, Status};
use uuid::Uuid;

const ONE_HOUR_IN_SECS: u64 = 60 * 60;

pub fn interceptor(mut req: Request<()>) -> Result<Request<()>, Status> {

    let settings = Settings::new();
    log::debug!("Keycloak public key: {}", settings.keycloak_pubkey);

    let jwt = match req.metadata().get("authorization") {
        Some(token) => {
            let token = token.to_str();
            match token {
                Ok(jwt) => jwt,
                Err(err) => return Err(Status::unauthenticated(err.to_string())),
            }
        }
        None => return Err(Status::unauthenticated("Token not found")),
    };

    log::debug!("Authentication token: {}", &jwt);

    let token = decode::<Claims>(
        &jwt,
        &DecodingKey::from_rsa_pem(settings.keycloak_pubkey.as_ref()).unwrap(),
        &Validation::new(Algorithm::RS512),
    );

    let token = match token {
        Ok(t) => t,
        Err(err) => {
            log::error!("KeyCloak authentication failed: {}", err);
            return Err(Status::unauthenticated(err.to_string()));
        }
    };

    // Double check time-based validity of token
    if !token.claims.ensure_timely_boundaries() {
        return Err(Status::unauthenticated("Token does not fulfill timely boundaries."));
    }

    // Add extensions to request
    req.extensions_mut().insert(UserExtension {
        is_admin: token.claims.has_role(&settings.keycloak_admin_role),
        user_id: token.claims.sub,
    });

    Ok(req)
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    exp: u64,                          // Expiration time (as UTC timestamp). JWT library automatically checks expiry.
    iat: u64,                          // Issued at (as UTC timestamp)
    sub: Uuid,                       // Subject (whom token refers to) --> user id
    realm_access: Option<RealmAccess>, // Roles
}

impl Claims {
    pub fn ensure_timely_boundaries(&self) -> bool {
        self.validate_issue_date() && self.validate_expiry_date()
    }

    fn validate_issue_date(&self) -> bool {
        self.iat > get_current_unix_timestamp() - ONE_HOUR_IN_SECS
    }

    fn validate_expiry_date(&self) -> bool {
        self.exp < get_current_unix_timestamp() + ONE_HOUR_IN_SECS
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

pub struct UserExtension {
    pub user_id: Uuid,
    pub is_admin: bool,
}

fn get_current_unix_timestamp() -> u64 {
    let start = SystemTime::now();
    start.duration_since(UNIX_EPOCH).expect("Time went backwards").as_secs()
}
