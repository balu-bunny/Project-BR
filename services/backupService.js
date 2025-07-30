const { exec, execSync } = require('../util/processWrapper');
const { randomUUID } = require('crypto');
const workItemModel = require('../models/workItemModel');

exports.processBackup = (req, res) => {
  const { orgId, objects, cloud, backupType  } = req.body;
  const objectName = objects[0];
  const id = randomUUID();

  const baseParams = {
    TableName: "JobStatusTable-BackUpAndRestore",
    Item: {
      id,
      PID: "backup",
      object: objectName,
      description: `Backup for ${objectName} on org ${orgId}`,
    }
  };

  const updateStatus = (status, customDescription) => {
    return workItemModel.insertWorkItem({ ...baseParams, Item: { ...baseParams.Item, status, description: customDescription || baseParams.Item.description, } });
  };

  updateStatus("started");

  //const q = `sf data export bulk --query 'SELECT Id, Name FROM ${objectName}' --output-file export-${objectName}.csv --wait 10 --target-org ${orgId}`;
  
  let query = `SELECT Id, Name FROM ${objectName}`;

  let countQuery = `SELECT Count() FROM ${objectName}`;
  const now = `$(date +%Y-%m-%d_%H-%M-%S)`;
  let clause = '';

  if (backupType === 'Daily') {
    clause += ` WHERE LastModifiedDate = TODAY`;
  } else if (backupType === 'Differential') {
    clause += ` WHERE LastModifiedDate >= LAST_N_DAYS:7`; // example: since last full backup
  } else if (backupType === 'Incremental') {
    clause += ` WHERE LastModifiedDate >= YESTERDAY`; // or use a custom timestamp if available
  }
  query += clause;
  countQuery += clause; // Full backup doesn't need a WHERE clause
  // Full backup doesn't need a WHERE clause

try{
  // Count the records first
  const countCommand = `sf data query --query "${countQuery}" --json --target-org ${orgId}`;

  const countOutput = execSync(countCommand, { encoding: 'utf-8' });
  const result = JSON.parse(countOutput);

  const totalRecords = result.result.totalSize;
  console.log(`Record count: ${totalRecords}`);

  if (totalRecords > 0) {
    const exportCommand = `sf data export bulk --query "${query}" --output-file export-${objectName}-${now}.csv --wait 10 --target-org ${orgId} && aws s3 mv export-${objectName}-${now}.csv s3://myapp-bucket-us-east-1-767900165297/${orgId}/${objectName}/`;
    const q = `echo '${exportCommand}' | bash`;
    console.log('Executing:', q);

    exec(q, async (err, stdout, stderr) => {
      if (err) {
        console.error('Backup command failed:', stderr);
        await updateStatus("failed",err.message || String(err));
        return res.status(500).json({ error: 'Backup command failed' });
      }

      console.log('Backup command output:', stdout);
      await updateStatus("success");

      res.json({ message: `Backup for ${objectName} started on org ${orgId}` });
    });
  }
}catch (error) {
  console.error('Error during backup process:', error);
  updateStatus("Error",error.message || String(error));

  return res.status(500).json({ error: 'An error occurred during the backup process' });
}



};
