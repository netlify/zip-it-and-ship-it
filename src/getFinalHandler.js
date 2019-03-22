const path = require("path");
const fs = require("fs");

/**
 * differentially handle the function
 *
 * if webpack.config.js exists, run webpack (possibly including babel loader)
 * elif babelrc (or babel.config.js) exists, run babel (not yet implemented)
 * else just serve raw function
 */
async function _getFinalHandler(functionPath, moduleDir, dir, dirPath) {
  if (dirPath) {
    // function is a directory

    // setup the cache
    const root = process.cwd();
    const dotNetlifyPath = path.join(root, ".netlify");
    const cachePath = path.join(dotNetlifyPath, "functions-cache");
    if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath);
    const functionName = dirPath.split("/").slice(-1)[0];
    const cacheFunctionPath = path.join(cachePath, functionName);
    if (!fs.existsSync(cacheFunctionPath)) fs.mkdirSync(cacheFunctionPath);

    // do work!
    const configPath = path.join(dirPath, "webpack.config.js");
    if (fs.existsSync(configPath)) {
      // run through webpack, incl possibly babel-loader
      // functionPath is the source
      // cacheFunctionPath is the output
      const givenWebpackConfig = require(configPath);
      givenWebpackConfig.entry = functionPath;
      givenWebpackConfig.context = dirPath;
      givenWebpackConfig.output = {
        path: cacheFunctionPath,
        filename: "bundle.js",
        libraryTarget: "commonjs"
      };
      // console.log({ givenWebpackConfig });
      return new Promise(function(resolve, reject) {
        const webpack = require("webpack");
        webpack(givenWebpackConfig, function(err, stats) {
          if (err) return reject(err);
          resolve(stats);
        });
      }).then(() => require(path.join(cacheFunctionPath, "bundle.js")));
    }
    // else if (
    //   /** just babel, no webpack section */
    //   fs.existsSync(path.join(dirPath, ".babelrc")) ||
    //   fs.existsSync(path.join(dirPath, ".babelrc.js"))
    //   // // SWYX: TODO - IMPLEMENT
    //   // || fs.existsSync(path.join(dirPath, "babel.config.js"))
    //   // || // babel field in package.json
    // ) {
    //   // // TODO: run babel thru require hook https://babeljs.io/docs/en/babel-register
    //   // const babelrc = require(path.join(dirPath, ".babelrc.js"));
    //   // // babelrc.extensions = [".js", ".mjs", ".ts"]
    //   // babelrc.plugins = ["@babel/plugin-transform-regenerator"];
    //   // require("@babel/register")(babelrc);
    //   return require(functionPath);
    // }
  }
  // else just serve raw function
  return require(functionPath);
}
module.exports = { getFinalHandler };

function getFinalHandler(...args) {
  // translate promise back to callback
  return {
    handler(e, ctx, cb) {
      return _getFinalHandler(...args)
        .then(handler => handler.handler(e, ctx, cb))
        .catch(err => {
          console.error("unexpected error during running final handler");
          console.error(err);
          process.exit(1);
        });
    }
  };
}
