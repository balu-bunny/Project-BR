const orgService = require('../services/orgService');

exports.getOrgs = async (req, res) => {
  try {
    const orgs = await orgService.fetchOrgList();
    res.json(orgs);
  } catch (err) {
    console.error('Error fetching orgs:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.addNewOrg = (req, res) => {
  console.log('Adding new org:', req.body);
  orgService.handleLogin(req, res);
};
