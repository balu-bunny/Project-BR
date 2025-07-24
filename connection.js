const axios = require('axios');

// Get orgId and type from command-line arguments
const [method, endpoint, orgId] = process.argv.slice(2);
console.log( process.argv);
console.log( process.argv.slice(2));
console.log('Usage: node call-api.js '+orgId+'---'+endpoint+'---'+method);
// if (!orgId) {
//   console.log('Usage: node call-api.js <orgId> <type>');
//   process.exit(1);
// }

(async () => {
  try {
    const endpointURL = 'http://localhost:3000/api/'+endpoint;
    console.log('Calling API endpoint:', endpointURL);
    if(!endpointURL) {
      console.log('Endpoint URL is not defined');
      process.exit(1);
    }

    if(!method || !['GET', 'POST'].includes(method.toUpperCase())) {
      console.log('Invalid method. Use GET or POST.');
      process.exit(1);
    }

    var response;
    if(method.toUpperCase() === 'GET') {
      response = await axios.get(endpointURL, {
        params: { orgId }
      });
    }else if(method.toUpperCase() === 'POST') {
        console.log('Type is required for POST method'+orgId);
        response = await axios.post(endpointURL, {
        params: { orgId }
        });
    }

    console.log('✅ API Response:');
    console.log(response.data);
  } catch (err) {
    console.error('❌ Error calling API:', err.response?.data || err.message);
  }
})();
