FROM node:16

ENV KC_URL=auth.bitraw.io
ENV KC_REALM=bitraw
ENV KC_CLIENT_ID=typescript-testsuite
ENV REST_API_SERVER=https://api.bitraw.io

WORKDIR /app

COPY package*.json ./
RUN npm i

COPY . ./
RUN npx tsc

COPY ../../orchestra/proto/exchange/matchengine.proto matchengine.proto

ENTRYPOINT node dist/bots/run_bots.js