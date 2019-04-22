const aModule = require("./a-module");

exports.handler = function(event, context, callback) {
  console.log(aModule);
  callback(null, {
    statusCode: 200,
    body: "success"
  });
};
