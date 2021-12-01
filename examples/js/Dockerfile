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

ENTRYPOINT node dist/bots/run_bots.js