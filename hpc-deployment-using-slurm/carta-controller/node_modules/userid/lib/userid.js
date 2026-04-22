// This code is PUBLIC DOMAIN, and is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.

module.exports = require("bindings")("userid.node");

module.exports.uid = username => module.exports.ids(username).uid;
