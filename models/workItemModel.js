// insertWorkItem.js
const { dynamo } = require('../config/aws');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

exports.insertWorkItem = async (params) => {
  console.log('insertWorkItem params:', params.Item.orgId, params.Item.object);
  const lastWorkItem = await getLastWorkItem(params.Item.orgId, params.Item.object);
  console.log('insertWorkItem existing work item:', params,lastWorkItem);
  if (lastWorkItem && ((lastWorkItem.status === 'success' && params.Item.status === 'started')||(lastWorkItem.status === 'started' && params.Item.status === 'success'))) {
    // If the last work item is still in 'batch' status, do not insert a new one
    params.Item.id = lastWorkItem.id; // Update the existing item
    console.log('Updating existing work item:', params.Item.id);
      try {
        const command = new PutCommand(params);
        const data = await dynamo.send(command);
        return data;
      } catch (err) {
        console.log('error inserting new work item:', err, params);
        throw err;
      }
  }else{
    console.log('Inserting new work item:', params);
      try {
        const command = new PutCommand(params);
        const data = await dynamo.send(command);
        return data;
      } catch (err) {
        console.log('error inserting new work item:', err, params);
        throw err;
      }
  }


};

const getLastWorkItem = async (orgId, objectNameId) => {
  console.log('getLastWorkItem params:', orgId, objectNameId);
  const STATUS_TABLE = 'JobStatusTable-BackUpAndRestore';
  try {
    const command = new QueryCommand({
      TableName: STATUS_TABLE,
      IndexName: 'ByOrgObjectStatus',
      KeyConditionExpression: 'orgId = :org AND #obj = :obj',
      FilterExpression: '#sta = :status or #sta = :status2',
      ExpressionAttributeNames: {
        '#obj': 'object',
        '#sta': 'status'
      },
      ExpressionAttributeValues: {
        ':org': orgId,
        ':obj': objectNameId,
        ':status': 'success',
        ':status2': 'started'
      },
      Limit: 1, // only get the latest (depending on how you sort)
      ScanIndexForward: false // if you have sort order (optional)
    });

    const data = await dynamo.send(command);
    console.log('getLastWorkItem params:', orgId, objectNameId);
    console.error('retrieved work item:', data.Items);
    console.error('retrieved work item:', data.Items?.[0]);
    return data.Items?.[0] || null;
  } catch (err) {
    console.error('Error fetching last work item:', err);
    console.error('Params:', orgId, objectNameId);
    return null;
  }
};

exports.getLastWorkItem = getLastWorkItem;
