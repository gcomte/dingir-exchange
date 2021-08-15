-- Add migration script here

insert into asset (id, symbol, name, precision_stor, precision_show) values
    ('BTC', 'BTC', 'Bitcoin', 6, 6),
    ('DIF', 'DIF', 'Difficulty', 6, 6),
    ('FEE', 'FEE', 'Median Fee', 6, 6)
    ;

-- Fee is disabled
insert into market (base_asset, quote_asset, precision_amount, precision_price, precision_fee, min_amount) values
    ('DIF', 'BTC', 4, 2, 0, 0.001),
    ('FEE', 'BTC', 4, 2, 0, 0.001)
    ;

