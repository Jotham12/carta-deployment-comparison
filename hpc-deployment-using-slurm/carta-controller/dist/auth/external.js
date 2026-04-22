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
Object.defineProperty(exports, "__esModule", { value: true });
exports.populateUserMap = populateUserMap;
exports.watchUserTable = watchUserTable;
exports.generateExternalVerifiers = generateExternalVerifiers;
const fs = __importStar(require("fs"));
const jwt = require("jsonwebtoken");
const util_1 = require("../util");
function populateUserMap(userMaps, issuer, filename) {
    const userMap = new Map();
    const commentRegex = new RegExp(/\s*#.*$/);
    const fieldRegex = new RegExp(/^(.*?)\s+(\S+)$/);
    try {
        const contents = fs.readFileSync(filename).toString();
        const lines = contents.split("\n");
        for (let line of lines) {
            // Trim leading and trailing whitespace
            line = line.trim();
            // Strip comments
            line = line.replace(commentRegex, "");
            // Skip empty lines
            if (!line) {
                continue;
            }
            // Valid entry format: <username1> <username2>
            // <username1> can be an arbitrary JSON string.
            // <username2> is a POSIX username which definitely contains no spaces.
            // The field separator can be any amount of whitespace.
            const entry = line.match(fieldRegex);
            if (!entry) {
                util_1.logger.warning(`Ignoring malformed usermap line: ${line}`);
                continue;
            }
            // Captured groups are 1-indexed (0 is the whole match)
            userMap.set(entry[1], entry[2]);
        }
        util_1.logger.info(`Updated usermap with ${userMap.size} entries`);
    }
    catch (e) {
        util_1.logger.error(`Error reading user table`);
    }
    if (Array.isArray(issuer)) {
        for (const iss of issuer) {
            userMaps.set(iss, userMap);
        }
    }
    else {
        userMaps.set(issuer, userMap);
    }
}
function watchUserTable(userMaps, issuers, filename) {
    populateUserMap(userMaps, issuers, filename);
    fs.watchFile(filename, () => populateUserMap(userMaps, issuers, filename));
}
function generateExternalVerifiers(verifierMap, authConf) {
    const publicKey = fs.readFileSync(authConf.publicKeyLocation);
    const verifier = (cookieString) => {
        const payload = jwt.verify(cookieString, publicKey, {
            algorithm: authConf.keyAlgorithm
        });
        if (payload && payload.iss && authConf.issuers.includes(payload.iss)) {
            // substitute unique field in for username
            if (authConf.uniqueField) {
                payload.username = payload[authConf.uniqueField];
            }
            return payload;
        }
        else {
            return undefined;
        }
    };
    for (const iss of authConf.issuers) {
        verifierMap.set(iss, verifier);
    }
}
//# sourceMappingURL=external.js.map