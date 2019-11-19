#!/bin/bash
# Upload test coverage to Codecov

token="$1"

os="$2"
os="${os/-latest/}"

node="$3"
node="node_${node//./_}"

curl -s https://codecov.io/bash | \
  bash -s -- -Z -y codecov.yml -f coverage/coverage-final.json -t "$token" -F "$os" -F "$node"
