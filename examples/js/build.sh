#!/bin/bash

cp ../../orchestra/proto/exchange/matchengine.proto ./matchengine.proto

docker build --tag bitraw-bots .