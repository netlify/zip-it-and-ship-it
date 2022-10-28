#!/usr/bin/env bash
set -exo pipefail

npm ci --prefix benchmarks/fixtures
npm run build
node benchmarks/nft.js > .delta.largeDepsNft
node benchmarks/zisi.js > .delta.largeDepsZisi
node benchmarks/esbuild.js > .delta.largeDepsEsbuild
