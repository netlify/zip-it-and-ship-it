const path = require("path");
const fs = require("fs");

/**
 * run through webpack, incl possibly babel-loader
 *
 * uses a cache inside .netlify/functions-cache/ to store build output
 *
 * functionPath: path to the js/ts file, not the function folder
 */
async function webpackify(configPath, functionPath, dirPath) {
  //

  // derive useful filepaths we can use
  const projectRoot = process.cwd();
  const cachePath = path.join(projectRoot, ".netlify", "functions-cache");
  const functionName = dirPath.split("/").slice(-1)[0];
  const cacheFunctionPath = path.join(cachePath, functionName);

  // functionPath is the source
  // cacheFunctionPath is the output
  const givenWebpackConfig = require(configPath);
  givenWebpackConfig.entry = functionPath;
  givenWebpackConfig.context = dirPath;
  givenWebpackConfig.output = {
    path: cacheFunctionPath,
    filename: functionName + ".js",
    libraryTarget: "commonjs"
  };
  return new Promise(function(resolve, reject) {
    const webpack = require("webpack");
    webpack(givenWebpackConfig, (err, stats) =>
      err ? reject(err) : resolve(stats)
    );
  }).then(() => path.join(cacheFunctionPath, functionName + ".js"));
}

/**
 * differentially handle the function
 *
 * if webpack.config.js exists, run webpack (possibly including babel loader)
 * elif babelrc (or babel.config.js) exists, run babel (not yet implemented)
 * else just serve raw function
 */
async function _getFinalHandler(functionPath, dirPath) {
  if (dirPath) {
    // function is a directory

    // do work!
    const configPath = path.join(dirPath, "webpack.config.js");
    if (fs.existsSync(configPath)) {
      return require(webpackify(configPath, functionPath, dirPath));
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
module.exports = { getFinalHandler, webpackify };

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
