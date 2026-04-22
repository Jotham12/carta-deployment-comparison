"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleCallbackHandler = googleCallbackHandler;
exports.generateGoogleRefreshHandler = generateGoogleRefreshHandler;
const google_auth_library_1 = require("google-auth-library");
const ms_1 = __importDefault(require("ms"));
const config_1 = require("../config");
const types_1 = require("../types");
const util_1 = require("../util");
const index_1 = require("./index");
const local_1 = require("./local");
function googleCallbackHandler(req, res, authConf) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Check for g_csrf_token match between cookie and body
        if (!req.cookies["g_csrf_token"] || !req.body["g_csrf_token"] || req.cookies["g_csrf_token"] !== req.body["g_csrf_token"]) {
            return res.status(400).json({ error: "Missing or non-matching CSRF token" });
        }
        const oAuth2Client = new google_auth_library_1.OAuth2Client();
        try {
            const result = yield oAuth2Client.verifyIdToken({
                idToken: (_a = req === null || req === void 0 ? void 0 : req.body) === null || _a === void 0 ? void 0 : _a.credential,
                audience: authConf.clientId
            });
            const payload = result.getPayload();
            // Do the mapping
            const username = authConf.useEmailAsId ? payload === null || payload === void 0 ? void 0 : payload.email : payload === null || payload === void 0 ? void 0 : payload.sub;
            // check that username exists and email is verified
            if (!username || !(payload === null || payload === void 0 ? void 0 : payload.email_verified)) {
                util_1.logger.warning("Google auth rejected due to lack of unique ID or email verification");
                return res.status(500).json({ error: "An error occured processing your login" });
            }
            // check that domain is valid
            if (authConf.validDomain && authConf.validDomain !== payload.hd) {
                util_1.logger.warning(`Google auth rejected due to incorrect domain: ${payload.hd}`);
                return res.status(500).json({ error: "An error occured processing your login" });
            }
            // create initial refresh token
            const refreshToken = (0, local_1.generateToken)(authConf, username, local_1.TokenType.Refresh);
            res.cookie("Refresh-Token", refreshToken, {
                path: config_1.RuntimeConfig.authPath,
                maxAge: (0, ms_1.default)(authConf.refreshTokenAge),
                httpOnly: true,
                secure: !config_1.ServerConfig.httpOnly,
                sameSite: "strict"
            });
            return res.redirect(`${config_1.RuntimeConfig.dashboardAddress}?googleuser=${username}`);
        }
        catch (e) {
            util_1.logger.debug(e);
            return res.status(500).json({ error: "An error occured processing your login" });
        }
    });
}
function generateGoogleRefreshHandler(authConf) {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const refreshTokenCookie = req.cookies["Refresh-Token"];
        const scriptingToken = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.scripting) === true;
        if (refreshTokenCookie) {
            try {
                const refreshToken = yield (0, index_1.verifyToken)(refreshTokenCookie);
                if (!refreshToken || !refreshToken.username || !refreshToken.refresh) {
                    next({ statusCode: 403, message: "Not authorized" });
                }
                else if (scriptingToken && config_1.ServerConfig.scriptingAccess !== types_1.ScriptingAccess.Enabled) {
                    next({
                        statusCode: 500,
                        message: "Scripting access not enabled for this server"
                    });
                }
                else {
                    const access_token = (0, local_1.generateToken)(authConf, refreshToken.username, scriptingToken ? local_1.TokenType.Scripting : local_1.TokenType.Access);
                    util_1.logger.info(`Refreshed ${scriptingToken ? "scripting" : "access"} token for user ${refreshToken.username}`);
                    res.json({
                        access_token,
                        token_type: "bearer",
                        username: refreshToken.username,
                        expires_in: (0, ms_1.default)(scriptingToken ? authConf.scriptingTokenAge : authConf.accessTokenAge) / 1000
                    });
                }
            }
            catch (err) {
                next({ statusCode: 400, message: "Invalid refresh token" });
            }
        }
        else {
            next({ statusCode: 400, message: "Missing refresh token" });
        }
    });
}
//# sourceMappingURL=google.js.map