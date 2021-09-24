const id = (arg) => arg
module.exports = (lang) => [require(`./lang/${lang}`), require(`./lang/${id(lang)}`)]
