-- Add migration script here
CREATE TABLE asset (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    symbol VARCHAR(30) NOT NULL DEFAULT '',
    name VARCHAR(30) NOT NULL DEFAULT '',
    precision_stor SMALLINT CHECK (precision_stor >= 0) NOT NULL,
    precision_show SMALLINT CHECK (precision_show >= 0) NOT NULL,
    create_time TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market (
    id SERIAL PRIMARY KEY,
    create_time TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    base_asset VARCHAR(30) NOT NULL REFERENCES asset(id) ON DELETE RESTRICT,
    quote_asset VARCHAR(30) NOT NULL REFERENCES asset(id) ON DELETE RESTRICT,
    precision_amount SMALLINT CHECK (precision_amount >= 0) NOT NULL,
    precision_price SMALLINT CHECK (precision_price >= 0) NOT NULL,
    precision_fee SMALLINT CHECK (precision_fee >= 0) NOT NULL,
    min_amount DECIMAL(16, 16) NOT NULL,
    market_name VARCHAR(30)
);
