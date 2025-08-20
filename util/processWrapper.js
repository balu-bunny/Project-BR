const { exec: rawExec, spawn: rawSpawn, execSync: rawExecSync } = require('child_process');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({ region: 'us-east-1' }); // ✅ Adjust region
const TABLE_NAME = 'ProcessLogTable-BackUpAndRestore'; // ✅ Replace with your DynamoDB table name

// Log to DynamoDB
async function logToDynamo({ pid, command, type, status }) {
  const id = uuidv4();
  const item = {
    PK: { S: `PROCESS#${id}` },
    PID: { S: pid.toString() },
    Command: { S: command },
    Type: { S: type },
    status: { S: status },
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
  const uuidStr = uuidv4();
  logToDynamo({ pid: uuidStr, command, type: 'exec', status: 'started' });
  const child = rawExec(command, options, callback);
  logToDynamo({ pid: child.pid, command, type: 'exec', status: 'completed' });
  return child;
}

// Wrapped spawn
function spawn(command, args, options) {
  const uuidStr = uuidv4();
  const fullCommand = `${command} ${args.join(' ')}`;

  logToDynamo({ pid: uuidStr, command: fullCommand, type: 'spawn', status: 'started' });
  const child = rawSpawn(command, args, { shell: true, ...options });
  logToDynamo({ pid: child.pid, command: fullCommand, type: 'spawn', status: 'completed' });
  return child;
}

function execSync(command, options) {
  const uuidStr = uuidv4();
  logToDynamo({ pid: uuidStr, command, type: 'execSync', status: 'started' });

  const result = rawExecSync(command, { shell: true, ...options });
  logToDynamo({ pid: process.pid, command, type: 'execSync', status: 'completed' });
  return result;
}

module.exports = {
  exec,
  spawn,
  execSync
};
