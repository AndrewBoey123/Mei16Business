// Mei16 router

const path = require('path');
require('dotenv').config({ 
  path: path.join(__dirname, '..', 'userdata', '.env'), 
  override: true, 
  silent: true 
});

const type = process.env.TYPE || "Web";

if (type === "Sock") {
    require(path.join(__dirname, 'Mei16_Sock', 'Mei16_Sock.js'));
} else if (type === "Web") {
    require(path.join(__dirname, 'Mei16_Web', 'Mei16_Web.js'));
} else {
    console.log("Invalid type, cannot route...");
}