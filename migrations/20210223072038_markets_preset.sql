-- Add migration script here

insert into asset (id, symbol, name, precision_stor, precision_show) values
	('BTC', 'BTC', 'Bitcoin', 6, 6),
	('ETH', 'ETH', 'Ether', 6, 6),
	('LTC', 'LTC', 'Litecoin', 6, 6),
	('XMR', 'XMR', 'Monero', 6, 6),
	('USDT', 'USDT', 'Tether USD', 6, 6)
	;

-- Fee is disabled
insert into market (base_asset, quote_asset, precision_amount, precision_price, precision_fee, min_amount) values
	('BTC', 'USDT', 4, 2, 0, 0.001),
	('ETH', 'USDT', 4, 2, 0, 0.001),
	('LTC', 'USDT', 4, 2, 0, 0.001),
	('XMR', 'USDT', 4, 2, 0, 0.001)
	;
