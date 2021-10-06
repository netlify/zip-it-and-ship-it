const id = (arg) => arg
module.exports = (lang) => [require(`./lang/${lang}.json`), require(`./lang/${id(lang)}.json`)]
