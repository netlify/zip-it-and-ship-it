module.exports = () => {
  const AWS = require('aws-sdk')
  const AWSv3 = require('@aws-sdk/client-s3')

  return { AWS, AWSv3 }
}
