#!/usr/bin/env bash
npm ci --prefix benchmarks/fixtures
npm run build
node benchmarks/zisi.js > .delta.largeDepsZisi
node benchmarks/esbuild.js > .delta.largeDepsEsbuild
