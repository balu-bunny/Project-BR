const { S3Client } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const region = 'us-east-1';

const s3 = new S3Client({ region });

const dynamoRaw = new DynamoDBClient({ region });
const dynamo = DynamoDBDocumentClient.from(dynamoRaw);

module.exports = { s3, dynamo };
