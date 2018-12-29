const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const expressLogging = require("express-logging");
const queryString = require("querystring");
const path = require("path");
const getPort = require("get-port");
const { findModuleDir } = require("./finders");

const defaultPort = 30001;

function handleErr(err, response) {
  response.statusCode = 500;
  response.write("Function invocation failed: " + err.toString());
  response.end();
  console.log("Error during invocation: ", err);
  return;
}

function createCallback(response) {
  return function callback(err, lambdaResponse) {
    if (err) {
      return handleErr(err, response);
    }

    response.statusCode = lambdaResponse.statusCode;
    for (const key in lambdaResponse.headers) {
      response.setHeader(key, lambdaResponse.headers[key]);
    }
    response.write(
      lambdaResponse.isBase64Encoded
        ? Buffer.from(lambdaResponse.body, "base64")
        : lambdaResponse.body
    );
    response.end();
  };
}

function promiseCallback(promise, callback) {
  if (!promise) return;
  if (typeof promise.then !== "function") return;
  if (typeof callback !== "function") return;

  promise.then(
    function(data) {
      callback(null, data);
    },
    function(err) {
      callback(err, null);
    }
  );
}

function getHandlerPath(functionPath) {
  if (functionPath.match(/\.js$/)) {
    return functionPath;
  }

  return path.join(functionPath, `${path.basename(functionPath)}.js`);
}

function createHandler(dir, options) {
  const functions = {};
  fs.readdirSync(dir).forEach(file => {
    if (dir === "node_modules") {
      return;
    }
    const functionPath = path.resolve(path.join(dir, file));
    if (path.extname(functionPath) === ".js") {
      functions[file.replace(/\.js$/, "")] = {
        functionPath,
        moduleDir: findModuleDir(functionPath)
      };
    } else if (fs.lstatSync(functionPath).isDirectory()) {
      functions[file] = {
        functionPath: path.join(
          functionPath,
          `${path.basename(functionPath)}.js`
        ),
        moduleDir: findModuleDir(functionPath)
      };
    }
  });

  return function(request, response) {
    // handle proxies without path re-writes (http-servr)
    const cleanPath = request.path.replace(/^\/.netlify\/functions/, "");

    const func = cleanPath.split("/").filter(function(e) {
      return e;
    })[0];
    if (!functions[func]) {
      response.statusCode = 404;
      response.end("Function not found...");
      return;
    }
    const { functionPath, moduleDir } = functions[func];
    if (options.static) {
      delete require.cache[require.resolve(functionPath)];
    }
    let handler;
    let before = module.paths;
    try {
      module.paths = [moduleDir];
      handler = require(functionPath);
      module.paths = before;
    } catch (err) {
      module.paths = before;
      handleErr(err, response);
      return;
    }

    const isBase64 =
      request.body &&
      !(request.headers["content-type"] || "").match(
        /text|application|multipart\/form-data/
      );
    const lambdaRequest = {
      path: request.path,
      httpMethod: request.method,
      queryStringParameters: queryString.parse(request.url.split(/\?(.+)/)[1]),
      headers: request.headers,
      body: isBase64
        ? Buffer.from(request.body.toString(), "utf8").toString("base64")
        : request.body,
      isBase64Encoded: isBase64
    };

    const callback = createCallback(response);
    const promise = handler.handler(lambdaRequest, {}, callback);
    promiseCallback(promise, callback);
  };
}

async function serveFunctions(settings, options) {
  options = options || {};
  const app = express();
  const dir = settings.functionsDir;
  const port = await getPort({ port: settings.port || defaultPort });

  app.use(bodyParser.raw({ limit: "6mb" }));
  app.use(bodyParser.text({ limit: "6mb", type: "*/*" }));
  app.use(
    expressLogging(console, {
      blacklist: ["/favicon.ico"]
    })
  );

  app.get("/favicon.ico", function(req, res) {
    res.status(204).end();
  });
  app.all("*", createHandler(dir, options));

  app.listen(port, function(err) {
    if (err) {
      console.error("Unable to start lambda server: ", err);
      process.exit(1);
    }

    console.log(`Lambda server is listening on ${port}`);
  });

  return Promise.resolve({
    port,
    clearCache: function(chunk) {
      var module = path.join(process.cwd(), dir, chunk);
      delete require.cache[require.resolve(module)];
    }
  });
}

module.exports = { serveFunctions };
