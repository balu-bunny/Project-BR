const { exec, execSync } = require('../util/processWrapper');
const { randomUUID } = require('crypto');
const workItemModel = require('../models/workItemModel');
const processBackup = (req, res) => {
  console.log('Processing backup request:', req.body);
  console.log('started');
  
  const { orgId, objects, cloud, backupType  } = req.body;
  const id = randomUUID();
  const objectName = objects[0];

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
    console.log(`Updating status: ${status}`,customDescription);
    baseParams.Item.status = status;
    baseParams.Item.description = customDescription || baseParams.Item.description;
    return workItemModel.insertWorkItem({ ...baseParams, Item: { ...baseParams.Item, status, description: customDescription || baseParams.Item.description, } });
  };
  try{
  updateStatus("processBackup started", `Processing backup for org ${orgId} with backupType ${backupType}`);

  if(cloud!=undefined&&cloud!=''){
    let cloudQuery = ` sf sobject list --sobject custom -o  ${orgId} --json`;
    const cloudQueryOutput = execSync(cloudQuery, { encoding: 'utf-8' });
    console.log('Cloud Query Output:', cloudQueryOutput);
          updateStatus("processBackup cloudQueryOutput",String(cloudQueryOutput));
    const objectsResult = JSON.parse(cloudQueryOutput);
          updateStatus("processBackup started",String(objectsResult));

    const totalobjects = objectsResult.result;
        console.log('Cloud Query Output:', objectsResult.result);

          updateStatus("processBackup started",`Total objects found: ${totalobjects.length}`);

    if(totalobjects.length>0){
      console.log('Total objects found: inside');
      totalobjects.forEach(function(r){
              console.log('Total objects found: inside :', r);

          processBackup({
            body: {
              orgId,
              objects: [r],
              backupType
            }
          });
        console.log(r)

      });

      return;
    }
  }


  if(objectName.endsWith('__b') ) {
    return;
  }


  updateStatus("started");



  

  //const q = `sf data export bulk --query 'SELECT Id, Name FROM ${objectName}' --output-file export-${objectName}.csv --wait 10 --target-org ${orgId}`;
  
  let objectFieldCommaSeparated ='';

  const objectFieldsOutput = execSync(`sf sobject describe --sobject ${objectName}  --target-org ${orgId} --json`, { encoding: 'utf-8' });

  const objectFields = JSON.parse(objectFieldsOutput);
  const fieldNames = objectFields.result.fields.map(field => field.name);
  objectFieldCommaSeparated = fieldNames.join(',');

  let query = `SELECT ${objectFieldCommaSeparated} FROM ${objectName}`;

  let countQuery = `SELECT Count() FROM ${objectName}`;
  const now = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
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
    const exportCommand = `sf data export bulk --query "${query}" --output-file export-${objectName}-${now}.csv --wait 10000 --target-org ${orgId} && aws s3 mv export-${objectName}-${now}.csv s3://myapp-bucket-us-east-1-767900165297/${orgId}/${objectName}/`;
    //const q = `echo '${exportCommand}' | bash`;
    const q = exportCommand;
    console.log('Executing:', q);

    exec(q, async (err, stdout, stderr) => {
      if (err) {
        console.error('Backup command failed:', stderr + `\nCommand: ${q}`);
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

  return res.status(500).json({ error: 'An error occurred during the backup process' }) ;
}
  }catch (error) {
    updateStatus("Error",error.message || String(error));
    console.error('Error in processBackup:', error);
    return res.status(500).json({ error: 'An error occurred during the backup process' });
  }


};
exports.processBackup = processBackup;