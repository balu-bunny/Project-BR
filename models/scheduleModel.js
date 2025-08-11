const AWS = require('aws-sdk');
const { randomUUID } = require('crypto');

const dynamoDb = new AWS.DynamoDB.DocumentClient({
  region: 'us-east-1'//process.env.AWS_REGION,
});

const TABLE_NAME = 'BackupJobs-BackUpAndRestore';




async function createSchedule({ orgId, objects, backupType, schedule }) {
  const jobId = randomUUID();
  const params = {
    TableName: TABLE_NAME,
    Item: {
      jobId,
      orgId,
      objects,
      backupType,
      schedule, // cron format
      status: 'active',
      lastRun: null,
      lastResult: null,
    },
  };
  await dynamoDb.put(params).promise();
  return { jobId, ...params.Item };
}

async function getActiveSchedules() {
  const params = {
    TableName: TABLE_NAME,
    FilterExpression: '#st = :active',
    ExpressionAttributeNames: {
      '#st': 'status',
    },
    ExpressionAttributeValues: {
      ':active': 'active',
    },
  };
  const result = await dynamoDb.scan(params).promise();
  return result.Items;
}

async function updateScheduleStatus(jobId, lastResult) {
  const params = {
    TableName: TABLE_NAME,
    Key: { jobId },
    UpdateExpression: 'SET lastRun = :now, lastResult = :result',
    ExpressionAttributeValues: {
      ':now': new Date().toISOString(),
      ':result': lastResult,
    },
  };
  await dynamoDb.update(params).promise();
}

async function insertWorkItem(params) {
  try {
    return await createSchedule(params);
  } catch (err) {
    throw err;
  }
}

module.exports = {
  createSchedule,
  getActiveSchedules,
  updateScheduleStatus,
  insertWorkItem,
};
