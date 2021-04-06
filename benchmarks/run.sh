#!/usr/bin/env bash
(cd benchmarks/fixtures && npm ci);
node benchmarks/index.js > .delta-t.json
