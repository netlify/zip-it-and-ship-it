#!/usr/bin/env bash
npm ci --prefix benchmarks/fixtures
node benchmarks/zisi.js > .delta.largeDepsZisi
node benchmarks/esbuild.js > .delta.largeDepsEsbuild
