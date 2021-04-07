#!/usr/bin/env bash
npm ci --prefix benchmarks/fixtures
node benchmarks/index.js > .delta-action.json
