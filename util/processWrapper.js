const { exec: rawExec, spawn: rawSpawn } = require('child_process');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({ region: 'us-east-1' }); // ✅ Adjust region
const TABLE_NAME = 'ProcessTracker'; // ✅ Replace with your DynamoDB table name

// Log to DynamoDB
async function logToDynamo({ pid, command, type }) {
  const id = uuidv4();
  const item = {
    PK: { S: `PROCESS#${id}` },
    PID: { N: pid.toString() },
    Command: { S: command },
    Type: { S: type },
    CreatedAt: { S: new Date().toISOString() },
  };

  try {
    await client.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(`Logged ${type} process (PID: ${pid}) to DynamoDB`);
  } catch (error) {
    console.error('Error logging to DynamoDB:', error);
  }
}

// Wrapped exec
function exec(command, options, callback) {
  const child = rawExec(command, options, callback);
  logToDynamo({ pid: child.pid, command, type: 'exec' });
  return child;
}

// Wrapped spawn
function spawn(command, args, options) {
  const child = rawSpawn(command, args, { shell: true, ...options });
  const fullCommand = `${command} ${args.join(' ')}`;
  logToDynamo({ pid: child.pid, command: fullCommand, type: 'spawn' });
  return child;
}

module.exports = {
  exec,
  spawn
};
