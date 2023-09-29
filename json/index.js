const fs = require('fs');
const path = require('path');

const models = {};

// Dynamically grabbing all JSON files in the folder
fs.readdirSync(__dirname).filter(file => file !== 'index.js').forEach(file => {
    const fullName = path.join(__dirname, file);
    const [fileName] = file.split('.');
    models[fileName] = require(fullName);
})

module.exports = models;