#!/usr/bin/env bash
exec 3>>.delta.largeDepsZisi
exec 4>>.delta.largeDepsEsbuild
exec 5>>.delta.largeDepsZisi.withFlag
exec 6>>.delta.largeDepsEsbuild.withFlag

npm ci --prefix benchmarks/fixtures
node benchmarks/zisi.js >&3
node benchmarks/esbuild.js >&4
NETLIFY_EXPERIMENTAL_DEFAULT_ES_MODULES_TO_ES_BUILD=true node benchmarks/zisi.js >&5
NETLIFY_EXPERIMENTAL_DEFAULT_ES_MODULES_TO_ES_BUILD=true node benchmarks/esbuild.js >&6
