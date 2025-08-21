// fetchWrapper.js
const { exec: rawExec, spawn: rawSpawn, execSync: rawExecSync } = require('child_process');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { fetch } = require('undici');

const client = new DynamoDBClient({ region: 'us-east-1' }); // ✅ Adjust region
const TABLE_NAME = 'ProcessLogTable-BackUpAndRestore'; // ✅ Replace with your DynamoDB table name

// Log to DynamoDB
async function logToDynamo({ pid, command, type, status }) {
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hour from now

  const item = {
    PK: { S: `PROCESS#${id}` },
    PID: { S: pid.toString() },
    Command: { S: command },
    Type: { S: type },
    status: { S: status },
    ExpiresAt : { S: expiresAt },
    CreatedAt: { S: new Date().toISOString() },
  };

  try {
    await client.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(`Logged ${type} process (PID: ${pid}) to DynamoDB`);
  } catch (error) {
    console.error('Error logging to DynamoDB:', error);
  }
}

function sanitizeOptions(options = {}) {
  const cloned = { ...options };

  if (cloned.headers) {
    // shallow copy headers
    const headers = { ...cloned.headers };
    delete headers['authorization'];
    delete headers['Authorization'];
    cloned.headers = headers;
  }

  return cloned;
}
async function fetchWrapper(url, options = {}) {

  const config = {
    ...options,
  };

      logToDynamo({ pid: url, command: JSON.stringify(sanitizeOptions(options)), type: 'fetch', status: 'started' });
    const response = await fetch(url, config);
      logToDynamo({ pid: url, command: JSON.stringify(response), type: 'fetch', status: 'completed' });

    return response;
}

module.exports = fetchWrapper;
