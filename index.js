// handler.js
const { serverless } = require('@probot/serverless-gcf');
const appFn = require('./src')
module.exports.probot = serverless(appFn)
