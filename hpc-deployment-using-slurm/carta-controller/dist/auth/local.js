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
exports.TokenType = void 0;
exports.generateToken = generateToken;
exports.addTokensToResponse = addTokensToResponse;
exports.generateLocalVerifier = generateLocalVerifier;
exports.generateLocalRefreshHandler = generateLocalRefreshHandler;
const fs = __importStar(require("fs"));
const types_1 = require("../types");
const jwt = require("jsonwebtoken");
const ms_1 = __importDefault(require("ms"));
const config_1 = require("../config");
const util_1 = require("../util");
const index_1 = require("./index");
let privateKey;
var TokenType;
(function (TokenType) {
    TokenType[TokenType["Access"] = 0] = "Access";
    TokenType[TokenType["Refresh"] = 1] = "Refresh";
    TokenType[TokenType["Scripting"] = 2] = "Scripting";
})(TokenType || (exports.TokenType = TokenType = {}));
function generateToken(authConf, username, tokenType) {
    if (!privateKey) {
        privateKey = fs.readFileSync(authConf.privateKeyLocation);
    }
    if (!authConf || !privateKey) {
        return null;
    }
    const payload = {
        iss: authConf.issuer,
        username
    };
    const options = {
        algorithm: authConf.keyAlgorithm,
        expiresIn: authConf.accessTokenAge
    };
    if (tokenType === TokenType.Refresh) {
        payload.refresh = true;
        options.expiresIn = authConf.refreshTokenAge;
    }
    else if (tokenType === TokenType.Scripting) {
        payload.scripting = true;
        options.expiresIn = authConf.scriptingTokenAge;
    }
    return jwt.sign(payload, privateKey, options);
}
function addTokensToResponse(res, authConf, username) {
    const refreshToken = generateToken(authConf, username, TokenType.Refresh);
    res.cookie("Refresh-Token", refreshToken, {
        path: config_1.RuntimeConfig.authPath,
        maxAge: (0, ms_1.default)(authConf.refreshTokenAge),
        httpOnly: true,
        secure: !config_1.ServerConfig.httpOnly,
        sameSite: "strict"
    });
    const access_token = generateToken(authConf, username, TokenType.Access);
    res.json({
        access_token,
        token_type: "bearer",
        expires_in: (0, ms_1.default)(authConf.accessTokenAge) / 1000
    });
}
function generateLocalVerifier(verifierMap, authConf) {
    const publicKey = fs.readFileSync(authConf.publicKeyLocation);
    verifierMap.set(authConf.issuer, cookieString => {
        const payload = jwt.verify(cookieString, publicKey, {
            algorithm: authConf.keyAlgorithm
        });
        if (payload && payload.iss === authConf.issuer) {
            return payload;
        }
        else {
            return undefined;
        }
    });
}
function generateLocalRefreshHandler(authConf) {
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
                    const uid = (0, util_1.getUserId)(refreshToken.username);
                    const access_token = generateToken(authConf, refreshToken.username, scriptingToken ? TokenType.Scripting : TokenType.Access);
                    util_1.logger.info(`Refreshed ${scriptingToken ? "scripting" : "access"} token for user ${refreshToken.username} with uid ${uid}`);
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
//# sourceMappingURL=local.js.map