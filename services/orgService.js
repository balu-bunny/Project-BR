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

exports.handleLogin =  (req, res) => {
  console.log('Handling login for org:'+req.body);
  const { orgId, type } = req.body.params || {};

  console.log('Handling login for org:'+orgId);
  console.log(orgId);

  const login = spawn('sf', ['org', 'login', 'device', '--alias', orgId], {
    shell: true
  });//warning! remove shell: true once UI is developed 

  let output = '';

  let responseSent = true; // <-- Declare it here


  login.stdout.on('data', (data) => {
    const message = data.toString();
    console.log(`stdout: ${message}`);
    output += message;

    if (!responseSent) {
      // send only once
      res.json({ message: `Follow instructions to login`, output: output });
      //
    }
    responseSent = false;
  });

  login.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`); 
  });

  login.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
    if (code === 0) {
      res.json({ message: `Login output for ${orgId}`, output });
    } else {
      res.status(500).json({ error: `Login failed with code ${code}`, output });
    }
  });
};

