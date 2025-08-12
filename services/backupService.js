// backupController.js
const { execSync } = require('../util/processWrapper');
const { randomUUID } = require('crypto');
const workItemModel = require('../models/workItemModel');
//const cron = require('node-cron');

// Use env vars to be EC2-safe and portable

let accountId = '';
try {
  accountId = execSync(
    'aws sts get-caller-identity --query "Account" --output text',
    { encoding: 'utf-8' }
  ).trim();
} catch (err) {
  console.error('Failed to get AWS account ID:', err.message);
}

let awsRegion = process.env.AWS_REGION || '';
try {
  if (!awsRegion) {
    awsRegion = execSync(
      'aws configure get region',
      { encoding: 'utf-8' }
    ).trim();
  }
} catch (err) {
  console.error('Failed to get AWS region:', err.message);
}

// Build S3 bucket name dynamically
const S3_BUCKET = process.env.S3_BUCKET || `myapp-bucket-${awsRegion}-${accountId}`;
const STATUS_TABLE = 'JobStatusTable-BackUpAndRestore';

const isPlatformEvent = (objectName) =>
  objectName.endsWith('__x') || objectName.endsWith('__e');

/**
 * Get last backup timestamp from DynamoDB for a given org + object
 */
async function getLastBackupTimestamp(orgId, objectName) {
  try {
    const lastRecord = await workItemModel.getLastWorkItem(orgId, objectName);
    if (lastRecord && lastRecord.Item && lastRecord.Item.timestamp) {
      return lastRecord.Item.timestamp;
    }
  } catch (err) {
    console.warn(`No last backup timestamp found for ${objectName} in ${orgId}`);
  }
  return null;
}

/**
 * Core backup logic
 */
async function performBackup({ orgId, objectName, backupType }) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const fileSafeTime = timestamp.replace(/T/, '_').replace(/:/g, '-').split('.')[0];

  const baseParams = {
    TableName: STATUS_TABLE,
    Item: {
      id,
      PID: 'backup',
      object: objectName,
      orgId,
      timestamp, // store for future incremental/differential
      backupType,
      ExpiresAt: timestamp,
      description: `Backup for ${objectName} on org ${orgId}`,
    },
  };

  const updateStatus = async (status, customDescription) => {
    baseParams.Item.status = status;
    baseParams.Item.description = customDescription || baseParams.Item.description;
    return workItemModel.insertWorkItem({
      ...baseParams,
      Item: {
        ...baseParams.Item,
        status,
        description: customDescription || baseParams.Item.description,
      },
    });
  };

  try {
    if (isPlatformEvent(objectName)) {
      console.log(`Skipping platform event or binary object: ${objectName}`);
      return;
    }

    await updateStatus('started', `Backup for ${objectName} on ${orgId}`);

    // Describe object fields
    const objectFieldsOutput = execSync(
      `sf sobject describe --sobject ${objectName} --target-org ${orgId} --json`,
      { encoding: 'utf-8' }
    );
    const objectFields = JSON.parse(objectFieldsOutput);


    const compoundParents = new Set(
      objectFields.result.fields
        .filter(f => f.compoundFieldName) // subfields
        .map(f => f.compoundFieldName)    // parent compound names
    );

    // 2️⃣ Filter out any field whose name is in compoundParents
    const filteredFields = objectFields.result.fields
      .filter(f => !compoundParents.has(f.name))
      .map(f => f.name);

    console.log(filteredFields);
    const objectFieldCommaSeparated = filteredFields.join(',');

    // Build query
    let query = `SELECT ${objectFieldCommaSeparated} FROM ${objectName}`;
    let countQuery = `SELECT Count() FROM ${objectName}`;
    let clause = '';

    let LastModifiedDate = 'LastModifiedDate';

    if(objectName.endsWith('__b')){
      LastModifiedDate = 'QPMS__CreatedDate__c'; // Use CreatedDate for initial backups
    }

    if (backupType === 'Daily') {
      clause += ` WHERE ${LastModifiedDate} = TODAY`;
    } else if (backupType === 'Differential') {
      const lastBackup = await getLastBackupTimestamp(orgId, objectName);
      if (lastBackup) {
        clause += ` WHERE ${LastModifiedDate} >= ${lastBackup}`;
      } else {
        clause += ` WHERE ${LastModifiedDate} >= LAST_N_DAYS:7`; // default if no history
      }
    } else if (backupType === 'Incremental') {
      const lastBackup = await getLastBackupTimestamp(orgId, objectName);
      if (lastBackup) {
        clause += ` WHERE ${LastModifiedDate} > ${lastBackup}`;
      } else {
        clause += ` WHERE ${LastModifiedDate} >= YESTERDAY`; // default if no history
      }
    }

    query += clause;
    countQuery += clause;

    // Count first
    if(!objectName.endsWith('__b')){
      const countOutput = execSync(
        `sf data query --query "${countQuery}" --json --target-org ${orgId}`,
        { encoding: 'utf-8' }
      );
      const totalRecords = JSON.parse(countOutput).result.totalSize;

      console.log(`[${objectName}] Record count: ${totalRecords}`);
      if (totalRecords === 0) {
        await updateStatus('skipped', `No records found for ${objectName}`);
        return;
      }
    }

    // Export & Upload
    const fileName = `export-${objectName}-${fileSafeTime}.csv`;
    const exportCommand = `sf data export bulk --query "${query}" --output-file ${fileName} --wait 10000 --target-org ${orgId}`;
    const uploadCommand = `aws s3 mv ${fileName} s3://${S3_BUCKET}/${orgId}/${objectName}/ --region ${awsRegion}`;
    const fullCommand = `${exportCommand} && ${uploadCommand}`;

    const fullCommandOutput = execSync(fullCommand, { encoding: 'utf-8' });
    console.log(`Backup command output for ${objectName}:`, fullCommandOutput);

    await updateStatus('success', `Backup successful for ${objectName}`);
  } catch (error) {
    console.error(`Error in backup for ${objectName}:`, error);
    await updateStatus('error', error.message || String(error));
  }
}

/**
 * Express route handler
 */
const processBackup = async (req, res) => {
  console.log('Received backup request:', req.body);

  const { orgId, objects, cloud, backupType } = req.body;

  if (!orgId || !objects || objects.length === 0) {
    return res
      .status(400)
      .json({ error: 'Invalid request. orgId and objects are required.' });
  }

  const objectName = objects[0];

  try {
    if (cloud) {
      const cloudQuery = `sf sobject list --sobject custom -o ${orgId} --json`;
      //const cloudQuery = `sf sobject list -o ${orgId} --json`;

      const cloudQueryOutput = execSync(cloudQuery, { encoding: 'utf-8' });
      const objectList = JSON.parse(cloudQueryOutput).result;

      console.log(`[CLOUD MODE] ${objectList.length} objects found.`);

      for (const obj of objectList) {
        await performBackup({ orgId, objectName: obj, backupType });
      }

      let standardPlatformObjects = [
        'Account',
        'Contact',
        'Task',
        'Event',
        'Note',
        'Attachment',
        'Document',
        'Report',
        'Dashboard',
        'ProcessDefinition',
        'ProcessNode',
        'ProcessInstance',
        'ProcessInstanceStep',
        'ProcessInstanceHistory',
        'ProcessInstanceWorkitem',
        'ContentVersion',
        'ContentDocument',
        'ContentDocumentLink',
        'ContentWorkspace',
        'ContentWorkspaceDoc'
      ]

      for (const obj of standardPlatformObjects) {
        await performBackup({ orgId, objectName: obj, backupType });
      }
      
      return res.json({
        message: `Backup started for ${objectList.length} cloud objects.`,
      });
    }

    // Local backup mode
    await performBackup({ orgId, objectName, backupType });

    res.json({
      message: `Backup initiated for ${objectName} on org ${orgId}`,
    });
  } catch (error) {
    console.error('Unhandled error in processBackup:', error);
    res
      .status(500)
      .json({ error: 'An unexpected error occurred during the backup process' });
  }
};

exports.processBackup = processBackup;

/**
 * Schedule daily backup at 02:00 AM server time
 */
// cron.schedule('0 2 * * *', async () => {
//   console.log('Running scheduled daily backup...');
//   try {
//     // Example: Hardcoded orgId & objects for scheduling
//     const orgId = process.env.ORG_ID;
//     const objects = process.env.BACKUP_OBJECTS
//       ? process.env.BACKUP_OBJECTS.split(',')
//       : ['Account', 'Contact'];

//     for (const objectName of objects) {
//       await performBackup({ orgId, objectName, backupType: 'Daily' });
//     }

//     console.log('Scheduled daily backup completed.');
//   } catch (err) {
//     console.error('Error in scheduled backup:', err);
//   }
// });
