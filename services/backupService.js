// backupController.js
const { exec, execSync } = require('../util/processWrapper');
const { randomUUID } = require('crypto');
const workItemModel = require('../models/workItemModel');

// Use env vars to be EC2-safe and portable
const S3_BUCKET = 'myapp-bucket-us-east-1-767900165297';//process.env.S3_BUCKET;
const AWS_REGION = 'us-east-1';//process.env.AWS_REGION;

const isPlatformEvent = (objectName) => {
  return objectName.endsWith('__x') || objectName.endsWith('__b') || objectName.endsWith('__e');
};

// Core backup logic separated for reusability
async function performBackup({ orgId, objectName, backupType }) {
  const id = randomUUID();
  const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];

  const baseParams = {
    TableName: "JobStatusTable-BackUpAndRestore",
    Item: {
      id,
      PID: "backup",
      object: objectName,
      description: `Backup for ${objectName} on org ${orgId}`,
    }
  };

  const updateStatus = async (status, customDescription) => {
    console.log(`Updating status: ${status}`, customDescription);
    baseParams.Item.status = status;
    baseParams.Item.description = customDescription || baseParams.Item.description;
    return workItemModel.insertWorkItem({
      ...baseParams,
      Item: {
        ...baseParams.Item,
        status,
        description: customDescription || baseParams.Item.description
      }
    });
  };

  try {
    if (isPlatformEvent(objectName)) {
      console.log(`Skipping platform event or binary object: ${objectName}`);
      return;
    }

    await updateStatus("started", `Backup for ${objectName} on ${orgId}`);

    const objectFieldsOutput = execSync(`sf sobject describe --sobject ${objectName} --target-org ${orgId} --json`, { encoding: 'utf-8' });
    const objectFields = JSON.parse(objectFieldsOutput);
    const fieldNames = objectFields.result.fields.map(field => field.name);
    const objectFieldCommaSeparated = fieldNames.join(',');

    let query = `SELECT ${objectFieldCommaSeparated} FROM ${objectName}`;
    let countQuery = `SELECT Count() FROM ${objectName}`;
    let clause = '';

    if (backupType === 'Daily') clause += ` WHERE LastModifiedDate = TODAY`;
    else if (backupType === 'Differential') clause += ` WHERE LastModifiedDate >= LAST_N_DAYS:7`;
    else if (backupType === 'Incremental') clause += ` WHERE LastModifiedDate >= YESTERDAY`;

    query += clause;
    countQuery += clause;

    const countCommand = `sf data query --query "${countQuery}" --json --target-org ${orgId}`;
    const countOutput = execSync(countCommand, { encoding: 'utf-8' });
    const totalRecords = JSON.parse(countOutput).result.totalSize;

    console.log(`[${objectName}] Record count: ${totalRecords}`);
    if (totalRecords === 0) {
      await updateStatus("skipped", `No records found for ${objectName}`);
      return;
    }

    const fileName = `export-${objectName}-${timestamp}.csv`;
    const exportCommand = `sf data export bulk --query "${query}" --output-file ${fileName} --wait 10000 --target-org ${orgId}`;
    const uploadCommand = `aws s3 mv ${fileName} s3://${S3_BUCKET}/${orgId}/${objectName}/ --region ${AWS_REGION}`;

    const fullCommand = `${exportCommand} && ${uploadCommand}`;

    // exec(fullCommand, async (err, stdout, stderr) => {
    //   if (err) {
    //     console.error(`Backup failed for ${objectName}:`, stderr);
    //     await updateStatus("failed", err.message || stderr);
    //     return;
    //   }
    //   console.log(`Backup completed for ${objectName}`, stdout);
    //   await updateStatus("success", `Backup successful for ${objectName}`);
    // });
    const fullCommandOutput = execSync(fullCommand, { encoding: 'utf-8' });
    console.log(`Backup command output for ${objectName}:`, fullCommandOutput);
    console.log(`Backup completed for ${objectName}`);
    await updateStatus("success", `Backup successful for ${objectName}. Output: ${fullCommandOutput}`);

  } catch (error) {
    console.error(`Error in backup for ${objectName}:`, error);
    await updateStatus("error", error.message || String(error));
  }
}

// Express endpoint
const processBackup = async (req, res) => {
  console.log('Received backup request:', req.body);

  const { orgId, objects, cloud, backupType } = req.body;

  if (!orgId || !objects || objects.length === 0) {
    return res.status(400).json({ error: 'Invalid request. orgId and objects are required.' });
  }

  const objectName = objects[0];

  try {
    if (cloud) {
      const cloudQuery = `sf sobject list --sobject custom -o ${orgId} --json`;
      const cloudQueryOutput = execSync(cloudQuery, { encoding: 'utf-8' });
      const objectList = JSON.parse(cloudQueryOutput).result;

      console.log(`[CLOUD MODE] ${objectList.length} objects found.`);

      for (const obj of objectList) {
        await performBackup({ orgId, objectName: obj, backupType });
      }

      return res.json({ message: `Backup started for ${objectList.length} cloud objects.` });
    }

    // Local backup mode
    await performBackup({ orgId, objectName, backupType });

    res.json({ message: `Backup initiated for ${objectName} on org ${orgId}` });
  } catch (error) {
    console.error('Unhandled error in processBackup:', error);
    res.status(500).json({ error: 'An unexpected error occurred during the backup process' });
  }
};

exports.processBackup = processBackup;
