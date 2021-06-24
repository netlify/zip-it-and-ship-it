const id = (arg) => arg

// eslint-disable-next-line import/no-dynamic-require, node/global-require, prefer-template
module.exports = (lang) => [require('./lang/' + lang + '.json'), require('./lang/' + id(lang) + '.json')]
