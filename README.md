# ![zip-it-and-ship-it](zip-it-and-ship-it.png)

[![npm version](https://img.shields.io/npm/v/@netlify/zip-it-and-ship-it.svg)](https://npmjs.org/package/@netlify/zip-it-and-ship-it)
[![Coverage Status](https://codecov.io/gh/netlify/zip-it-and-ship-it/branch/main/graph/badge.svg)](https://codecov.io/gh/netlify/zip-it-and-ship-it)
[![Build](https://github.com/netlify/zip-it-and-ship-it/workflows/Build/badge.svg)](https://github.com/netlify/zip-it-and-ship-it/actions)
[![Downloads](https://img.shields.io/npm/dm/@netlify/zip-it-and-ship-it.svg)](https://www.npmjs.com/package/@netlify/zip-it-and-ship-it)

Creates Zip archives from Node.js, Go, and Rust programs. Those archives are ready to be uploaded to AWS Lambda.

This library is used under the hood by several Netlify features, including
[production CI builds](https://github.com/netlify/build), [Netlify CLI](https://github.com/netlify/cli) and the
[JavaScript client](https://github.com/netlify/js-client).

Check Netlify documentation for:

- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [Bundling Functions in the CLI](https://www.netlify.com/docs/cli/#unbundled-javascript-function-deploys)

# Installation

```bash
npm install @netlify/zip-it-and-ship-it
```

# Usage (Node.js)

## zipFunctions(srcFolder, destFolder, options?)

`srcFolder`: `string`\
`destFolder`: `string`\
`options`: `object?`\
_Return value_: `Promise<object[]>`

```js
const { zipFunctions } = require('@netlify/zip-it-and-ship-it')

const zipNetlifyFunctions = async function () {
  const archives = await zipFunctions('functions', 'functions-dist')
  return archives
}
```

Creates Zip `archives` from Node.js, Go, and Rust programs. Those `archives` are ready to be uploaded to AWS Lambda.

`srcFolder` is the source files directory. It must exist. In Netlify, this is the
["Functions folder"](https://docs.netlify.com/functions/configure-and-deploy/#configure-the-functions-folder).

`srcFolder` can contain:

- Sub-directories with a main file called either `index.js` or `{dir}.js` where `{dir}` is the sub-directory name.
- `.js` files (Node.js)
- `.zip` archives with Node.js already ready to upload to AWS Lambda.
- Go programs already compiled. Those are copied as is.
- Rust programs already compiled. Those are zipped.

When using Node.js files, only the dependencies required by the main file are bundled, in order to keep the archive as
small as possible, which improves the Function runtime performance:

- All files/directories within the same directory (except `node_modules`) are included
- All the `require()`'d files are included
- All the `require()`'d `node_modules` are included, recursively
- The following modules are never included:
  - `@types/*` TypeScript definitions
  - `aws-sdk`
- Temporary files like `*~`, `*.swp`, etc. are not included

This is done by parsing the JavaScript source in each Function file, and reading the `package.json` of each Node module.

`destFolder` is the directory where each `.zip` archive should be output. It is created if it does not exist. In Netlify
CI, this is an unspecified temporary directory inside the CI machine. In Netlify CLI, this is a `.netlify/functions`
directory in your build directory.

### Options

#### archiveFormat

_Type_: `string`\
_Default value_: `zip`

Format of the archive created for each function. Defaults to ZIP archives.

If set to `none`, the output of each function will be a directory containing all the bundled files.

#### config

_Type_: `object`\
_Default value_: `{}`

An object matching glob-like expressions to objects containing configuration properties. Whenever a function name
matches one of the expressions, it inherits the configuration properties.

The following properties are accepted:

- `externalNodeModules`

  _Type_: `array<string>`

  List of Node modules to include separately inside a node_modules directory.

- `ignoredNodeModules`

  _Type_: `array<string>`

  List of Node modules to keep out of the bundle.

- `nodeBundler`

  _Type_: `string`\
  _Default value_: `zisi`

  The bundler to use when processing JavaScript functions. Possible values: `zisi`, `esbuild`, `esbuild_zisi`.

  When the value is `esbuild_zisi`, `esbuild` will be used with a fallback to `zisi` in case of an error.

- `nodeVersion`

  _Type_: `string`\
  _Default value_: `12.x`

  The version of Node.js to use as the compilation target. Possible values:

  - `8.x` (or `nodejs8.x`)
  - `10.x` (or `nodejs10.x`)
  - `12.x` (or `nodejs12.x`)
  - `14.x` (or `nodejs14.x`)

#### parallelLimit

_Type_: `number`\
_Default value_: `5`

Maximum number of Functions to bundle at the same time.

### Return value

This returns a `Promise` resolving to an array of objects describing each archive. Each object has the following
properties.

#### path

_Type_: `string`

Absolute file path to the archive file.

#### runtime

_Type_: `string`

Either `"js"`, `"go"`, or `"rs"`.

## zipFunction(srcPath, destFolder, options?)

`srcPath`: `string`\
`destFolder`: `string`\
`options`: `object?`\
_Return value_: `object | undefined`

```js
const { zipFunction } = require('@netlify/zip-it-and-ship-it')

const zipNetlifyFunctions = async function () {
  const archive = await zipFunctions('functions/function.js', 'functions-dist')
  return archive
}
```

This is like [`zipFunctions()`](#zipfunctionssrcfolder-destfolder-options) except it bundles a single Function.

The return value is `undefined` if the Function is invalid.

## listFunctions(srcFolder)

`srcFolder`: `string`\
_Return value_: `Promise<object[]>`

Returns the list of Functions to bundle.

```js
const { listFunctions } = require('@netlify/zip-it-and-ship-it')

const listNetlifyFunctions = async function () {
  const functions = await listFunctions('functions/function.js')
  return functions
}
```

### Return value

Each object has the following properties.

#### name

_Type_: `string`

Function's name. This is the one used in the Function URL. For example, if a Function is a `myFunc.js` regular file, the
`name` is `myFunc` and the URL is `https://{hostname}/.netlify/functions/myFunc`.

#### mainFile

_Type_: `string`

Absolute path to the Function's main file. If the Function is a Node.js directory, this is its `index.js` or `{dir}.js`
file.

#### runtime

_Type_: `string`

Either `"js"`, `"go"`, or `"rs"`.

#### extension

_Type_: `string`

Source file extension. For Node.js, this is either `.js` or `.zip`. For Go, this can be anything.

## listFunctionsFiles(srcFolder)

`srcFolder`: `string`\
_Return value_: `Promise<object[]>`

Like [`listFunctions()`](#listfunctionssrcfolder), except it returns not only the Functions main files, but also all
their required files. This is much slower.

```js
const { listFunctionsFiles } = require('@netlify/zip-it-and-ship-it')

const listNetlifyFunctionsFiles = async function () {
  const functions = await listFunctionsFiles('functions/function.js')
  return functions
}
```

### Return value

The return value is the same as [`listFunctions()`](#listfunctionssrcfolder) but with the following additional
properties.

#### srcFile

_Type_: `string`

Absolute file to the source file.

# Usage (CLI)

```bash
$ zip-it-and-ship-it srcFolder destFolder
```

The CLI performs the same logic as [`zipFunctions()`](#zipfunctionssrcfolder-destfolder-options). The archives are
printed on `stdout` as a JSON array.

# Troubleshooting

## Build step

`zip-it-and-ship-it` does not build, transpile nor install the dependencies of the Functions. This needs to be done
before calling `zip-it-and-ship-it`.

## Missing dependencies

If a Node module `require()` another Node module but does not list it in its `package.json` (`dependencies`,
`peerDependencies` or `optionalDependencies`), it is not bundled, which might make the Function fail.

More information in [this issue](https://github.com/netlify/zip-it-and-ship-it/issues/68).

## Conditional require

Files required with a `require()` statement inside an `if` or `try`/`catch` block are always bundled.

More information in [this issue](https://github.com/netlify/zip-it-and-ship-it/issues/68).

## Dynamic require

Files required with a `require()` statement whose argument is not a string literal, e.g. `require(variable)`, are never
bundled.

More information in [this issue](https://github.com/netlify/zip-it-and-ship-it/issues/68).

## Node.js native modules

If your Function or one of its dependencies uses Node.js native modules, the Node.js version used in AWS Lambda might
need to be the same as the one used when installing those native modules.

In Netlify, this is done by ensuring that the following Node.js versions are the same:

- Build-time Node.js version: this defaults to Node `10`, but can be
  [overridden with a `.nvmrc` or `NODE_VERSION` environment variable](https://docs.netlify.com/configure-builds/manage-dependencies/#node-js-and-javascript).
- Function runtime Node.js version: this defaults to `nodejs12.x` but can be
  [overriden with a `AWS_LAMBDA_JS_RUNTIME` environment variable](https://docs.netlify.com/functions/build-with-javascript/#runtime-settings).

Note that this problem might not apply for Node.js native modules using the [N-API](https://nodejs.org/api/n-api.html).

More information in [this issue](https://github.com/netlify/zip-it-and-ship-it/issues/69).

## File Serving

As of `v0.3.0` the `serveFunctions` capability has been extracted out to
[Netlify Dev](https://github.com/netlify/netlify-dev-plugin/).
