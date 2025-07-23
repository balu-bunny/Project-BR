const express = require('express');
const router = express.Router();
const orgController = require('../controllers/orgController');
const backupController = require('../controllers/backupController');

router.get('/orgs', orgController.getOrgs);
router.post('/backup', backupController.backupData);
router.post('/addNewOrg', orgController.addNewOrg);
router.post('/envvariable', orgController.addNewOrg);

module.exports = router;
