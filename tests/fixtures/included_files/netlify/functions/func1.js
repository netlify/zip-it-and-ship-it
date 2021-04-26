const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

const pReadFile = promisify(fs.readFile)

module.exports.handler = async (event) => {
  const { name } = event.queryStringParameters
  const filePath = path.resolve(__dirname, `../../content/${name}.md`)

  try {
    const data = await pReadFile(filePath, 'utf8')

    return {
      statusCode: 200,
      body: data,
    }
  } catch (_) {
    return {
      statusCode: 500,
      body: 'Uh-oh',
    }
  }
}
