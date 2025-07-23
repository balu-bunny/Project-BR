const dynamo = require('../config/aws');

exports.insertWorkItem = (params) => {
  return new Promise((resolve, reject) => {
    dynamo.put(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
};