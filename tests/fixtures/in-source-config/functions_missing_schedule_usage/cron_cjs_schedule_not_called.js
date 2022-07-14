const { schedule } = require('@netlify/functions')

// Should throw an error that `schedule` is imported but cron expression not found
module.exports.handler = {}
