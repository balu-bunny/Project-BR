// server.js
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const jwkToPem = require('jwk-to-pem');
const axios = require('axios');
const app = express();

const USER_POOL_ID = 'us-east-1_XXXXXXXXX';
const REGION = 'us-east-1';
const JWKS_URL = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;

let pems = {};

async function fetchJWKS() {
  const { data } = await axios.get(JWKS_URL);
  data.keys.forEach(key => {
    pems[key.kid] = jwkToPem(key);
  });
}
fetchJWKS(); // Fetch on start

// Serve static HTML files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to protect routes
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) return res.status(401).json({ message: 'Token required' });

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) return res.status(401).json({ message: 'Invalid token' });

  const pem = pems[decoded.header.kid];
  if (!pem) return res.status(401).json({ message: 'Invalid token key' });

  jwt.verify(token, pem, { algorithms: ['RS256'] }, (err, payload) => {
    if (err) return res.status(403).json({ message: 'Token invalid' });
    req.user = payload;
    next();
  });
}

// Example protected route
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: `Hello, ${req.user.email}`, user: req.user });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
