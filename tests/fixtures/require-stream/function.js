const streams = require("stream/web")

exports.handler = () => ({
  statusCode: 200,
  body: "streams type is " + typeof streams
})