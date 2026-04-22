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
exports.authRouter = void 0;
exports.verifyToken = verifyToken;
exports.getUser = getUser;
exports.authGuard = authGuard;
const jwt = require("jsonwebtoken");
const express_1 = __importDefault(require("express"));
const config_1 = require("../config");
const util_1 = require("../util");
const external_1 = require("./external");
const google_1 = require("./google");
const ldap_1 = require("./ldap");
const local_1 = require("./local");
const oidc_1 = require("./oidc");
const pam_1 = require("./pam");
// maps JWT claim "iss" to a token verifier
const tokenVerifiers = new Map();
// maps JWT claim "iss" to a user map
const userMaps = new Map();
let loginHandler = (req, res) => {
    throw { statusCode: 501, message: "Login not implemented" };
};
let refreshHandler = (req, res) => {
    throw { statusCode: 501, message: "Token refresh not implemented" };
};
let callbackHandler = (req, res) => {
    throw { statusCode: 501, message: "Callback handler not implemented" };
};
// Local providers
if (config_1.ServerConfig.authProviders.pam) {
    const authConf = config_1.ServerConfig.authProviders.pam;
    (0, local_1.generateLocalVerifier)(tokenVerifiers, authConf);
    loginHandler = (0, pam_1.getPamLoginHandler)(authConf);
    refreshHandler = (0, local_1.generateLocalRefreshHandler)(authConf);
}
else if (config_1.ServerConfig.authProviders.ldap) {
    const authConf = config_1.ServerConfig.authProviders.ldap;
    (0, local_1.generateLocalVerifier)(tokenVerifiers, authConf);
    loginHandler = (0, ldap_1.getLdapLoginHandler)(authConf);
    refreshHandler = (0, local_1.generateLocalRefreshHandler)(authConf);
}
else if (config_1.ServerConfig.authProviders.google) {
    const authConf = config_1.ServerConfig.authProviders.google;
    (0, local_1.generateLocalVerifier)(tokenVerifiers, authConf);
    refreshHandler = (0, google_1.generateGoogleRefreshHandler)(authConf);
    callbackHandler = (req, res) => (0, google_1.googleCallbackHandler)(req, res, authConf);
    if (authConf.userLookupTable) {
        (0, external_1.watchUserTable)(userMaps, authConf.issuer, authConf.userLookupTable);
    }
}
else if (config_1.ServerConfig.authProviders.external) {
    const authConf = config_1.ServerConfig.authProviders.external;
    (0, external_1.generateExternalVerifiers)(tokenVerifiers, authConf);
    const tablePath = authConf.userLookupTable;
    if (tablePath) {
        (0, external_1.watchUserTable)(userMaps, authConf.issuers, tablePath);
    }
}
else if (config_1.ServerConfig.authProviders.oidc) {
    const authConf = config_1.ServerConfig.authProviders.oidc;
    (0, oidc_1.generateLocalOidcVerifier)(tokenVerifiers, authConf);
    refreshHandler = (0, oidc_1.generateLocalOidcRefreshHandler)(authConf);
    loginHandler = (req, res) => (0, oidc_1.oidcLoginStart)(req, res, authConf);
    callbackHandler = (req, res) => (0, oidc_1.oidcCallbackHandler)(req, res, authConf);
    (0, oidc_1.initOidc)(authConf);
    if (authConf.userLookupTable) {
        util_1.logger.info(`Using ${authConf.userLookupTable} for user mapping`);
        (0, external_1.watchUserTable)(userMaps, authConf.issuer, authConf.userLookupTable);
    }
}
// Check for empty token verifies
if (!tokenVerifiers.size) {
    util_1.logger.emerg("No valid token verifiers specified");
    process.exit(1);
}
function verifyToken(cookieString) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenJson = jwt.decode(cookieString);
        if (tokenJson && tokenJson.iss) {
            const verifier = tokenVerifiers.get(tokenJson.iss);
            if (verifier) {
                return yield verifier(cookieString);
            }
        }
        return undefined;
    });
}
function getUser(username, issuer) {
    const userMap = userMaps.get(issuer);
    if (userMap) {
        return userMap.get(username);
    }
    else {
        return username;
    }
}
// Express middleware to guard against unauthorized access. Writes the username to the request object
function authGuard(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenString = req.token;
        if (tokenString) {
            try {
                const token = yield verifyToken(tokenString);
                if (!token || !token.username) {
                    next({ statusCode: 403, message: "Not authorized" });
                }
                else {
                    req.username = getUser(token.username, token.iss);
                    if (token.scripting) {
                        req.scripting = true;
                    }
                    next();
                }
            }
            catch (err) {
                next({ statusCode: 403, message: err.message });
            }
        }
        else {
            next({ statusCode: 403, message: "Not authorized" });
        }
    });
}
function logoutHandler(req, res) {
    res.cookie("Refresh-Token", "", {
        path: config_1.RuntimeConfig.authPath,
        maxAge: 0,
        httpOnly: true,
        secure: !config_1.ServerConfig.httpOnly,
        sameSite: "strict"
    });
    return res.redirect(`${config_1.RuntimeConfig.dashboardAddress}`);
}
function handleCheckAuth(req, res) {
    res.json({
        success: true,
        username: req.username
    });
}
exports.authRouter = express_1.default.Router();
if (config_1.ServerConfig.authProviders.oidc) {
    exports.authRouter.get("/logout", util_1.noCache, oidc_1.oidcLogoutHandler);
    exports.authRouter.get("/oidcCallback", util_1.noCache, callbackHandler);
    exports.authRouter.get("/login", util_1.noCache, loginHandler);
}
else if (config_1.ServerConfig.authProviders.google) {
    exports.authRouter.post("/googleCallback", util_1.noCache, callbackHandler);
    exports.authRouter.get("/logout", util_1.noCache, logoutHandler);
}
else {
    exports.authRouter.post("/login", util_1.noCache, loginHandler);
    exports.authRouter.get("/logout", util_1.noCache, logoutHandler);
}
exports.authRouter.post("/refresh", util_1.noCache, refreshHandler);
exports.authRouter.get("/status", authGuard, util_1.noCache, handleCheckAuth);
//# sourceMappingURL=index.js.map