#!/usr/bin/env bash
(cd benchmarks/fixtures/function_1 && npm install);
node benchmarks/index.js > .delta-t.json
