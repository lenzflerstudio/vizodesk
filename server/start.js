require('dotenv').config({ path: __dirname + '/.env' });

// Debug (temporary)
console.log('JWT ENV CHECK:', process.env.JWT_SECRET);

require('./index.js');
