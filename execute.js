const { execSync } = require('child_process');

let awsRegion = '';
try {
  awsRegion = execSync(`
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 21600") && \
    AZ=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
      http://169.254.169.254/latest/meta-data/placement/availability-zone) && \
    REGION=\${AZ::-1} && \
    echo $REGION
  `, { encoding: 'utf-8', shell: '/bin/bash' }).trim();
} catch (err) {
  console.error('Failed to get AWS region:', err.message);
}

console.log('AWS Region:', awsRegion);
