const backupService = require('../services/backupService');

exports.backupData = (req, res) => {
  backupService.processBackup(req, res);
};
