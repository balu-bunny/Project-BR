// insertWorkItem.js
const { dynamo } = require('../config/aws');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');

exports.insertWorkItem = async (params) => {
  try {
    const command = new PutCommand(params);
    const data = await dynamo.send(command);
    return data;
  } catch (err) {
    throw err;
  }
};
