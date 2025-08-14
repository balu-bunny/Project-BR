// testCsvRead.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser'); // Install with: npm install csv-parser

// Sample CSV file path
const localCsvPath = path.join(__dirname, 'sample.csv');

// Read CSV file and log each row
fs.createReadStream(localCsvPath)
  .pipe(csv())
  .on('data', (row) => {
    console.log('Row:', row.age);
  })
  .on('end', () => {
    console.log('✅ CSV file successfully processed.');
  })
  .on('error', (err) => {
    console.error('❌ Error reading CSV:', err);
  });
