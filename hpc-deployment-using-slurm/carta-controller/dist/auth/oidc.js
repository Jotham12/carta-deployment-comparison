"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.initOidc = initOidc;
exports.generateLocalOidcRefreshHandler = generateLocalOidcRefreshHandler;
exports.generateLocalOidcVerifier = generateLocalOidcVerifier;
exports.oidcLoginStart = oidcLoginStart;
exports.oidcCallbackHandler = oidcCallbackHandler;
exports.oidcLogoutHandler = oidcLogoutHandler;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const jose = __importStar(require("jose"));
const config_1 = require("../config");
const util_1 = require("../util");
const oidcRefreshManager_1 = require("./oidcRefreshManager");
let privateKey;
let publicKey;
let symmetricKey;
let jwksManager;
let oidcAuthEndpoint;
let oidcIssuer;
let oidcLogoutEndpoint;
let oidcTokenEndpoint;
let postLogoutRedirect;
function initOidc(authConf) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Load public & private keys
        publicKey = (0, crypto_1.createPublicKey)(fs.readFileSync(authConf.localPublicKeyLocation));
        privateKey = (0, crypto_1.createPrivateKey)(fs.readFileSync(authConf.localPrivateKeyLocation));
        symmetricKey = (0, crypto_1.createSecretKey)(Buffer.from(fs.readFileSync(authConf.symmetricKeyLocation, "utf-8"), "base64"));
        // Parse details of IdP from metadata URL
        const idpConfig = yield axios_1.default.get(authConf.idpUrl + "/.well-known/openid-configuration");
        oidcAuthEndpoint = idpConfig.data["authorization_endpoint"];
        oidcIssuer = idpConfig.data["issuer"];
        oidcLogoutEndpoint = idpConfig.data["end_session_endpoint"];
        oidcTokenEndpoint = idpConfig.data["token_endpoint"];
        // Init JWKS key management
        util_1.logger.info(`Setting up JWKS management for ${idpConfig.data["jwks_uri"]}`);
        jwksManager = jose.createRemoteJWKSet(new URL(idpConfig.data["jwks_uri"]));
        // Set logout redirect URL
        if (authConf.postLogoutRedirect !== undefined) {
            postLogoutRedirect = authConf.postLogoutRedirect;
        }
        else {
            postLogoutRedirect = (_a = config_1.ServerConfig.serverAddress) !== null && _a !== void 0 ? _a : "";
        }
        // Init refresh token management
        yield (0, oidcRefreshManager_1.initRefreshManager)();
    });
}
function returnErrorMsg(req, res, statusCode, msg) {
    if (req.header("accept") == "application/json") {
        return res.status(statusCode).json({ statusCode: statusCode, message: msg });
    }
    else {
        // Errors are presented to the user on the dashboard rather than returned via JSON messages
        return res.redirect(`${new URL(`${config_1.RuntimeConfig.dashboardAddress}`, config_1.ServerConfig.serverAddress).href}?${new URLSearchParams({ err: msg }).toString()}`);
    }
}
// A helper function as initial call to the IdP token endpoint and renewals are mostly the same
function callIdpTokenEndpoint(usp_1, req_1, res_1, authConf_1) {
    return __awaiter(this, arguments, void 0, function* (usp, req, res, authConf, scriptingToken = false, isLogin = false, sessionId, sessionEncKey) {
        // Fill in the common request elements
        usp.set("client_id", authConf.clientId);
        usp.set("client_secret", authConf.clientSecret);
        usp.set("scope", authConf.scope);
        try {
            const result = yield axios_1.default.post(`${oidcTokenEndpoint}`, usp);
            if (result.status != 200) {
                return returnErrorMsg(req, res, 500, "Authentication error");
            }
            const { payload, protectedHeader } = yield jose.jwtVerify(result.data["id_token"], jwksManager, {
                issuer: oidcIssuer
            });
            // Check audience
            if (payload.aud != authConf.clientId) {
                return returnErrorMsg(req, res, 500, "Service received an ID token directed to a different service");
            }
            // Create / retrieve session encryption key
            if (sessionEncKey === undefined) {
                sessionEncKey = (0, crypto_1.randomBytes)(32);
            }
            const username = payload[authConf.uniqueField];
            if (username === undefined) {
                return returnErrorMsg(req, res, 500, "Unable to match to a local user");
            }
            // Update DB to reflect new token + associated access token expiry
            if (result.data["refresh_token"] !== undefined) {
                (0, oidcRefreshManager_1.setRefreshToken)(username, sessionId, result.data["refresh_token"], sessionEncKey, parseInt(result.data["refresh_expires_in"]));
            }
            const refreshExpiry = result.data["refresh_expires_in"] !== undefined ? result.data["refresh_expires_in"] : result.data["expires_in"];
            //refreshData['access_token_expiry'] =  floor(new Date().getTime() / 1000) + result.data['expires_in'];
            if (result.data["expires_in"] !== undefined) {
                (0, oidcRefreshManager_1.setAccessTokenExpiry)(username, sessionId, parseInt(result.data["expires_in"]));
            }
            // Check group membership
            if (authConf.requiredGroup !== undefined) {
                if (payload[`${authConf.groupsField}`] === undefined) {
                    return returnErrorMsg(req, res, 403, "Identity provider did not supply group membership");
                }
                const idpGroups = payload[`${authConf.groupsField}`];
                if (Array.isArray(idpGroups)) {
                    const groupList = idpGroups;
                    if (!groupList.includes(`${authConf.requiredGroup}`)) {
                        return returnErrorMsg(req, res, 403, "Not part of required group");
                    }
                }
                else {
                    return returnErrorMsg(req, res, 403, "Invalid group membership info received");
                }
            }
            // Build refresh token
            // If there's no actual refresh token then this will only last for as long as the access token does
            const refreshData = {
                username,
                sessionId,
                sessionEncKey: sessionEncKey.toString("hex")
            };
            const rt = yield new jose.EncryptJWT(refreshData).setProtectedHeader({ alg: "dir", enc: authConf.symmetricKeyType }).setIssuedAt().setIssuer(authConf.issuer).setExpirationTime(`${refreshExpiry}s`).encrypt(symmetricKey);
            res.cookie("Refresh-Token", rt, {
                path: config_1.RuntimeConfig.authPath,
                maxAge: parseInt(refreshExpiry) * 1000,
                httpOnly: true,
                secure: !config_1.ServerConfig.httpOnly,
                sameSite: "strict"
            });
            if (result.data["id_token"] !== undefined) {
                res.cookie("Logout-Token", result.data["id_token"], {
                    path: config_1.RuntimeConfig.logoutAddress,
                    httpOnly: true,
                    secure: !config_1.ServerConfig.httpOnly,
                    sameSite: "strict"
                });
            }
            // After login redirect to the dashboard, but otherwise return a bearer token
            if (isLogin) {
                const loginUsp = new URLSearchParams();
                loginUsp.set("oidcuser", `${username}`);
                if (req.cookies["redirectParams"]) {
                    loginUsp.set("redirectParams", req.cookies["redirectParams"]);
                    res.cookie("redirectParams", "", {
                        maxAge: 600000,
                        httpOnly: true,
                        secure: !config_1.ServerConfig.httpOnly
                    });
                }
                return res.redirect(`${new URL(`${config_1.RuntimeConfig.dashboardAddress}`, config_1.ServerConfig.serverAddress).href}?${loginUsp.toString()}`);
            }
            else {
                const newAccessToken = { username };
                if (scriptingToken)
                    newAccessToken["scripting"] = true;
                const newAccessTokenJWT = yield new jose.SignJWT(newAccessToken).setProtectedHeader({ alg: authConf.keyAlgorithm }).setIssuedAt().setIssuer(authConf.issuer).setExpirationTime(`${result.data["expires_in"]}s`).sign(privateKey);
                return res.json({
                    access_token: newAccessTokenJWT,
                    token_type: "bearer",
                    username: payload.username,
                    expires_in: result.data["expires_in"]
                });
            }
        }
        catch (err) {
            util_1.logger.warning(err);
            return returnErrorMsg(req, res, 500, "Error requesting tokens from identity provider");
        }
    });
}
function generateLocalOidcRefreshHandler(authConf) {
    return (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const refreshTokenCookie = req.cookies["Refresh-Token"];
        const scriptingToken = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.scripting) === true;
        if (refreshTokenCookie) {
            try {
                // Verify that the token is legit
                const { payload, protectedHeader } = yield jose.jwtDecrypt(refreshTokenCookie, symmetricKey, {
                    issuer: authConf.issuer
                });
                try {
                    if (!(yield (0, oidcRefreshManager_1.acquireRefreshLock)(payload === null || payload === void 0 ? void 0 : payload.sessionId, 10))) {
                        return returnErrorMsg(req, res, 500, "Timed out waiting to acquire lock");
                    }
                }
                catch (err) {
                    return returnErrorMsg(req, res, 500, "Locking error");
                }
                try {
                    // Check if access token validity is there and at least cacheAccessTokenMinValidity seconds from expiry
                    const remainingValidity = yield (0, oidcRefreshManager_1.getAccessTokenExpiry)(payload.username, payload.sessionId);
                    if (remainingValidity > authConf.cacheAccessTokenMinValidity) {
                        const newAccessToken = {
                            username: payload.username,
                            expires_in: remainingValidity
                        };
                        if (scriptingToken)
                            newAccessToken["scripting"] = true;
                        const newAccessTokenJWT = yield new jose.SignJWT(newAccessToken)
                            .setProtectedHeader({ alg: authConf.keyAlgorithm })
                            .setIssuedAt()
                            .setIssuer(`${(_b = config_1.ServerConfig.authProviders.oidc) === null || _b === void 0 ? void 0 : _b.issuer}`)
                            .setExpirationTime(`${remainingValidity}s`)
                            .sign(privateKey);
                        return res.json({
                            access_token: newAccessTokenJWT,
                            token_type: "bearer",
                            username: payload.username,
                            expires_in: remainingValidity
                        });
                    }
                    else {
                        // Need to request a new token from upstream
                        const usp = new URLSearchParams();
                        const sessionEncKey = Buffer.from(`${payload === null || payload === void 0 ? void 0 : payload.sessionEncKey}`, "hex");
                        usp.set("grant_type", "refresh_token");
                        usp.set("refresh_token", `${yield (0, oidcRefreshManager_1.getRefreshToken)(payload.username, payload.sessionId, sessionEncKey)}`);
                        return yield callIdpTokenEndpoint(usp, req, res, authConf, scriptingToken, false, `${payload["sessionId"]}`, sessionEncKey);
                    }
                }
                finally {
                    yield (0, oidcRefreshManager_1.releaseRefreshLock)(payload === null || payload === void 0 ? void 0 : payload.sessionId);
                }
            }
            catch (err) {
                return returnErrorMsg(req, res, 400, "Invalid refresh token");
            }
        }
        else {
            return returnErrorMsg(req, res, 400, "Missing refresh token");
        }
    });
}
function generateLocalOidcVerifier(verifierMap, authConf) {
    // Note that we need only verify the tokens we've wrapped ourselves here
    verifierMap.set(authConf.issuer, (cookieString) => __awaiter(this, void 0, void 0, function* () {
        const result = yield jose.jwtVerify(cookieString, privateKey, {
            issuer: authConf.issuer,
            algorithms: [authConf.keyAlgorithm]
        });
        return result.payload;
    }));
}
function oidcLoginStart(req, res, authConf) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const usp = new URLSearchParams();
            // Generate PKCE verifier & challenge
            const urlSafeChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
            const codeVerifier = Array.from({ length: 64 }, (_, i) => urlSafeChars[Math.floor(Math.random() * urlSafeChars.length)]).join("");
            const encryptedCodeVerifier = yield new jose.CompactEncrypt(new TextEncoder().encode(codeVerifier)).setProtectedHeader({ alg: "RSA-OAEP", enc: "A128GCM" }).encrypt(publicKey);
            res.cookie("oidcVerifier", encryptedCodeVerifier, {
                maxAge: 600000,
                httpOnly: true,
                secure: !config_1.ServerConfig.httpOnly
            });
            const codeChallenge = (0, crypto_1.createHash)("sha256").update(codeVerifier, "utf-8").digest("base64url");
            usp.set("code_challenge_method", "S256");
            usp.set("code_challenge", codeChallenge);
            // Create session key
            const sessionId = Array.from({ length: 32 }, (_, i) => urlSafeChars[Math.floor(Math.random() * urlSafeChars.length)]).join("");
            res.cookie("sessionId", sessionId, {
                maxAge: 600000,
                httpOnly: true,
                secure: !config_1.ServerConfig.httpOnly
            });
            usp.set("state", sessionId);
            usp.set("client_id", authConf.clientId);
            usp.set("redirect_uri", new URL(config_1.RuntimeConfig.apiAddress + "/auth/oidcCallback", config_1.ServerConfig.serverAddress).href);
            usp.set("response_type", "code");
            usp.set("scope", authConf.scope);
            // Allow arbitrary params to be passed for IdPs like Google that require additional ones
            for (const item of authConf.additionalAuthParams) {
                usp.set(item[0], item[1]);
            }
            // Store redirectParams to redirect post-login
            if ("redirectParams" in req.query) {
                res.cookie("redirectParams", req.query["redirectParams"], {
                    maxAge: 600000,
                    httpOnly: true,
                    secure: !config_1.ServerConfig.httpOnly
                });
            }
            // Return redirect
            return res.redirect(`${oidcAuthEndpoint}?${usp.toString()}`);
        }
        catch (err) {
            util_1.logger.error(err);
            return returnErrorMsg(req, res, 500, err);
        }
    });
}
function oidcCallbackHandler(req, res, authConf) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const usp = new URLSearchParams();
            if (req.cookies["oidcVerifier"] === undefined) {
                return returnErrorMsg(req, res, 400, "Missing OIDC verifier");
            }
            if (req.cookies["sessionId"] === undefined) {
                return returnErrorMsg(req, res, 400, "Missing session ID");
            }
            else if (req.cookies["sessionId"] != `${req.query.state}`) {
                return returnErrorMsg(req, res, 400, "Invalid session ID");
            }
            else {
                res.clearCookie("sessionId");
            }
            const decryptedCodeVerifier = yield jose.compactDecrypt(req.cookies["oidcVerifier"], privateKey);
            const codeVerifier = new TextDecoder().decode(decryptedCodeVerifier.plaintext);
            usp.set("code_verifier", codeVerifier);
            res.clearCookie("oidcVerifier");
            usp.set("code", `${req.query.code}`);
            usp.set("grant_type", "authorization_code");
            usp.set("redirect_uri", new URL(config_1.RuntimeConfig.apiAddress + "/auth/oidcCallback", config_1.ServerConfig.serverAddress).href);
            return yield callIdpTokenEndpoint(usp, req, res, authConf, false, true, `${req.query.state}`, undefined);
        }
        catch (err) {
            util_1.logger.error(err);
            return returnErrorMsg(req, res, 500, err);
        }
    });
}
function oidcLogoutHandler(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            res.cookie("Refresh-Token", "", {
                path: config_1.RuntimeConfig.authPath,
                maxAge: 0,
                httpOnly: true,
                secure: !config_1.ServerConfig.httpOnly,
                sameSite: "strict"
            });
            if (oidcLogoutEndpoint !== undefined) {
                // Redirect to the IdP to perform the logout
                const usp = new URLSearchParams();
                if (req.cookies["Logout-Token"] !== undefined) {
                    usp.set("id_token_hint", req.cookies["Logout-Token"]);
                }
                usp.set("post_logout_redirect_uri", postLogoutRedirect);
                res.cookie("Logout-Token", "", {
                    path: config_1.RuntimeConfig.logoutAddress,
                    maxAge: 0,
                    httpOnly: true,
                    secure: !config_1.ServerConfig.httpOnly,
                    sameSite: "strict"
                });
                return res.redirect(`${oidcLogoutEndpoint}?${usp.toString()}`);
            }
            else {
                return res.redirect(`${config_1.ServerConfig.serverAddress}`);
            }
        }
        catch (err) {
            util_1.logger.error(err);
            return returnErrorMsg(req, res, 500, err);
        }
    });
}
//# sourceMappingURL=oidc.js.map