const { exec } = require('child_process');
const { randomUUID } = require('crypto');
const workItemModel = require('../models/workItemModel');

exports.processBackup = (req, res) => {
  const { orgId, objects } = req.body;
  const objectName = objects[0];
  const id = randomUUID();

  const baseParams = {
    TableName: "WorkItems",
    Item: {
      id,
      name: "backup",
      object: objectName
    }
  };

  const updateStatus = (status) => {
    return workItemModel.insertWorkItem({ ...baseParams, Item: { ...baseParams.Item, status } });
  };

  updateStatus("started");

  const q = `sf data export bulk --query 'SELECT Id, Name FROM ${objectName}' --output-file export-${objectName}.csv --wait 10 --target-org ${orgId}`;
  console.log('Executing:', q);

  exec(q, async (err, stdout, stderr) => {
    if (err) {
      console.error('Backup command failed:', stderr);
      await updateStatus("failed");
      return res.status(500).json({ error: 'Backup command failed' });
    }

    console.log('Backup command output:', stdout);
    await updateStatus("success");

    res.json({ message: `Backup for ${objectName} started on org ${orgId}` });
  });
};
