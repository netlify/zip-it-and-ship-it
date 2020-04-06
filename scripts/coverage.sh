#!/bin/bash
# Upload test coverage to Codecov

os="$1"
os="${os/-latest/}"

node="$2"
node="node_${node//./_}"

curl -s https://codecov.io/bash | \
  bash -s -- -Z -y codecov.yml -f coverage/coverage-final.json -F "$os" -F "$node"
