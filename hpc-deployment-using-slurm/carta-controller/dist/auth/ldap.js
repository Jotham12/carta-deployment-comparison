"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLdapLoginHandler = getLdapLoginHandler;
const ldapauth_fork_1 = __importDefault(require("ldapauth-fork"));
const util_1 = require("../util");
const local_1 = require("./local");
let ldap;
function getLdapLoginHandler(authConf) {
    ldap = new ldapauth_fork_1.default(authConf.ldapOptions);
    ldap.on("error", err => util_1.logger.error("LdapAuth: ", err));
    setTimeout(() => {
        var _a;
        const ldapConnected = (_a = ldap === null || ldap === void 0 ? void 0 : ldap._userClient) === null || _a === void 0 ? void 0 : _a.connected;
        if (ldapConnected) {
            util_1.logger.info("LDAP connected correctly");
        }
        else {
            util_1.logger.error("LDAP not connected!");
        }
    }, 2000);
    return (req, res) => {
        var _a, _b;
        const username = (_a = req.body) === null || _a === void 0 ? void 0 : _a.username;
        const password = (_b = req.body) === null || _b === void 0 ? void 0 : _b.password;
        if (!username || !password) {
            return res.status(400).json({ statusCode: 400, message: "Malformed login request" });
        }
        const handleAuth = (err, user) => {
            if (err) {
                util_1.logger.error(err);
                return res.status(403).json({
                    statusCode: 403,
                    message: "Invalid username/password combo"
                });
            }
            if ((user === null || user === void 0 ? void 0 : user.uid) !== username) {
                util_1.logger.warning(`Returned user "uid ${user === null || user === void 0 ? void 0 : user.uid}" does not match username "${username}"`);
                util_1.logger.debug(user);
            }
            try {
                const uid = (0, util_1.getUserId)(username);
                util_1.logger.info(`Authenticated as user ${username} with uid ${uid} using LDAP`);
                return (0, local_1.addTokensToResponse)(res, authConf, username);
            }
            catch (e) {
                util_1.logger.debug(e);
                return res.status(403).json({ statusCode: 403, message: "User does not exist" });
            }
        };
        ldap.authenticate(username, password, (error, user) => {
            var _a;
            const errorObj = error;
            // Need to reconnect to LDAP when we get a TLS error
            if ((_a = errorObj === null || errorObj === void 0 ? void 0 : errorObj.name) === null || _a === void 0 ? void 0 : _a.includes("ConfidentialityRequiredError")) {
                util_1.logger.warning(`TLS error encountered. Reconnecting to the LDAP server!`);
                ldap.close();
                ldap = new ldapauth_fork_1.default(authConf.ldapOptions);
                ldap.on("error", err => util_1.logger.error("LdapAuth: ", err));
                // Wait for the connection to be re-established
                setTimeout(() => {
                    ldap.authenticate(username, password, handleAuth);
                }, 500);
            }
            else {
                handleAuth(error, user);
            }
        });
    };
}
//# sourceMappingURL=ldap.js.map