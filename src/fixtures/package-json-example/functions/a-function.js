// Test if zip-it-and-ship-it is working

const cool = require("cool-ascii-faces");

exports.handler = function(event, context, callback) {
  callback(null, {
    statusCode: 200,
    isBase64Encoded: false,
    body: cool()
  });
};
