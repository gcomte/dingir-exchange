#!/bin/bash

cp ../../orchestra/proto/exchange/matchengine.proto ./matchengine.proto

      - name: Run trading tests
        run: |
          cd ./examples/js/
          npx ts-node tests/trade.ts
          sleep 5
          npx ts-node tests/print_orders.ts
          npx ts-node tests/put_batch_orders.ts
          npx ts-node tests/unfavorable_prices.ts
