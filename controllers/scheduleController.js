const scheduleItem = require('../models/scheduleModel');
exports.addNewOrg = (req, res) => {
  console.log('Adding new org:', req.body);
  scheduleItem.createSchedule(req, res);
};