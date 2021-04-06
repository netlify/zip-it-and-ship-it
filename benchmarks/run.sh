#!/usr/bin/env bash
(cd benchmarks/fixtures && npm install);
node benchmarks/index.js > .delta-t.json
