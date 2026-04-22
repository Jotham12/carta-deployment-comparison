"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPamLoginHandler = getPamLoginHandler;
const util_1 = require("../util");
const local_1 = require("./local");
function getPamLoginHandler(authConf) {
    const { pamAuthenticate } = require("node-linux-pam");
    return (req, res) => {
        var _a, _b;
        const username = (_a = req.body) === null || _a === void 0 ? void 0 : _a.username;
        const password = (_b = req.body) === null || _b === void 0 ? void 0 : _b.password;
        if (!username || !password) {
            return res.status(400).json({ statusCode: 400, message: "Malformed login request" });
        }
        pamAuthenticate({ username, password }, (err, code) => {
            if (err) {
                return res.status(403).json({
                    statusCode: 403,
                    message: "Invalid username/password combo"
                });
            }
            else {
                try {
                    const uid = (0, util_1.getUserId)(username);
                    util_1.logger.info(`Authenticated as user ${username} with uid ${uid} using PAM`);
                    return (0, local_1.addTokensToResponse)(res, authConf, username);
                }
                catch (e) {
                    return res.status(403).json({ statusCode: 403, message: "User does not exist" });
                }
            }
        });
    };
}
//# sourceMappingURL=pam.js.map