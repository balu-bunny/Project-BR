const { exec, spawn } = require('child_process');

exports.fetchOrgList = () => {
  return new Promise((resolve, reject) => {
    exec('sf org list --json', (err, stdout) => {
      if (err) return reject(new Error('Failed to fetch org list'));

      try {
        const parsed = JSON.parse(stdout);
        const orgs = (parsed.result?.nonScratchOrgs || []).map(org => ({
          id: org.username,
          name: org.alias || org.username,
          type: org.isSandbox ? 'Sandbox' : 'Production',
          scheduledTask: null
        }));
        resolve(orgs);
      } catch (e) {
        reject(new Error('Invalid JSON format'));
      }
    });
  });
};

exports.handleLogin = (req, res) => {
  const { orgId } = req.body;
  const login = spawn('sf', ['org', 'login', 'device', '--alias', orgId]);

  let output = '';
  let responded = false;

  login.stdout.on('data', (data) => {
    const message = data.toString();
    output += message;
    if (!responded) {
      res.json({ message: 'Follow instructions to login', output: message });
      responded = true;
    }
  });

  login.stderr.on('data', (data) => console.error(`stderr: ${data}`));

  login.on('close', (code) => {
    if (!responded) {
      res.status(code === 0 ? 200 : 500).json({
        message: code === 0 ? `Login output for ${orgId}` : `Login failed with code ${code}`,
        output,
      });
      responded = true;
    }
  });
};
