# zip-it-and-ship-it

[![npm version][npm-img]][npm] [![build status][travis-img]][travis] [![dependencies][david-img]][david] [![downloads][dl-img]][dl]

This module handles zipping up lambda functions with their dependencies before deployment.  You are probably looking for [netlify-cli](https://github.com/netlify/cli) or [js-client](https://github.com/netlify/js-client).

## Installation

```bash
npm install zip-it-and-ship-it
```

## Usage

```js
const { zipFunctions } = require("@netlify/zip-it-and-ship-it");

zipFunctions("functions", "functions-dist");
```

This will take all functions in the `functions` folder and create a matching `.zip` file in the `functions-dist` folder.

Each function can either be a single `.js` file that exports a `handler` or a folder with a `.js` with the same name as the folder exporting a handler.

The packaging tool will look for the `package.json` closest to the handler and use that for dependency resolution. Make sure you've run `npm install` or `yarn` for each `package.json` before using `zip-it-and-ship-it`.

Ie, the following combinations would all work:

```console
/functions/foo.js
/package.json
/node_modules/
```

```console
/functions/foo.js
/functions/bar/bar.js
/functions/package.json
/functions/node_modules/
```

```console
/functions/foo.js
/functions/bar/bar.js
/functions/bar/package.json
/functions/bar/node_modules
/package.json
/node_modules/
```

Zip It and Ship It will only include dependencies in each zip file that's been required from the relevant handler file.

### File Serving

As of v0.3.0 the serveFunctions capability has been extracted out to [Netlify Dev](https://github.com/netlify/netlify-dev-plugin/).

## API

### `promise(zipped) = zipFunctions(source, destination, [opts])`

Discover and zip all functions found in the `source` path into the `destination`.  Returns a promise containing a `zipped` array of function objects.

The array of zipped function objects has the following shape:

```js
[
  {
    path,  // Absolute filepath to zipped function
    runtime // 'go' or 'js'
  }
  //...
]
```

`opts` include:

```js
{
  parallelLimit: 5, // Limit the number of concurrent zipping operations at a time
  skipGo: false // Don't zip go functions, just move them to the destination path
}
```

## CLI

A minimal CLI version of `zip-it-and-ship-it` is provided for use inside the [build-image](https://github.com/netlify/build-image), although this is automatically invoked on users behalf during builds and you typically do not need to run this yourself.

```console
$ zip-it-and-ship-it --help
@netlify/zip-it-and-ship-it: Zip lambda functions and their dependencies for deployment

Usage: zip-it-and-ship-it [source] [destination] {options}
    --zip-go, -g          zip go binaries (default: false)
    --help, -h            show help
    --version, -v         print the version of the program
```

## See Also

Check [our official docs here](https://www.netlify.com/docs/cli/#unbundled-javascript-function-deploys).

[npm-img]: https://img.shields.io/npm/v/@netlify/zip-it-and-ship-it.svg
[npm]: https://npmjs.org/package/@netlify/zip-it-and-ship-it
[travis-img]: https://img.shields.io/travis/netlify/zip-it-and-ship-it/master.svg
[travis]: https://travis-ci.org/netlify/zip-it-and-ship-it
[dl-img]: https://img.shields.io/npm/dm/@netlify/zip-it-and-ship-it.svg
[dl]: https://www.npmjs.com/package/@netlify/zip-it-and-ship-it
[david-img]: https://david-dm.org/netlify/zip-it-and-ship-it/status.svg
[david]: https://david-dm.org/netlify/zip-it-and-ship-it
