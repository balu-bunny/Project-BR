const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const apiRoutes = require('./routes/apiRoutes');
console.log(__dirname);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
});