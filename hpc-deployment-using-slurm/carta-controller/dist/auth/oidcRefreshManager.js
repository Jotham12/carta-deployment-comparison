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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRefreshManager = initRefreshManager;
exports.acquireRefreshLock = acquireRefreshLock;
exports.releaseRefreshLock = releaseRefreshLock;
exports.getRefreshToken = getRefreshToken;
exports.setRefreshToken = setRefreshToken;
exports.getAccessTokenExpiry = getAccessTokenExpiry;
exports.setAccessTokenExpiry = setAccessTokenExpiry;
exports.clearTokens = clearTokens;
const crypto_1 = require("crypto");
const lodash_1 = require("lodash");
const mongodb_1 = require("mongodb");
const config_1 = require("../config");
const util_1 = require("../util");
let lockCollection;
let refreshTokenCollection;
let accessTokenLifeTimesCollection;
function initRefreshManager() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // A weird error occurs when a second DB object is created using same client
            // so recreating the client here as well
            const client = yield mongodb_1.MongoClient.connect(config_1.ServerConfig.database.uri);
            const db = client.db(config_1.ServerConfig.database.databaseName);
            // Ensure that locks and refresh tokens tables are there with appropriate indices
            if (!(yield db.listCollections({ name: "tokenLock" }, { nameOnly: true }).hasNext())) {
                util_1.logger.info("Creating token lock collection");
                lockCollection = yield db.createCollection("tokenLock");
            }
            else {
                lockCollection = yield db.collection("tokenLock");
            }
            if (!(yield db.listCollections({ name: "refreshTokens" }, { nameOnly: true }).hasNext())) {
                util_1.logger.info("Creating refresh tokens collection");
                refreshTokenCollection = yield db.createCollection("refreshTokens");
            }
            else {
                refreshTokenCollection = yield db.collection("refreshTokens");
            }
            if (!(yield db.listCollections({ name: "accessTokenLifetimes" }, { nameOnly: true }).hasNext())) {
                util_1.logger.info("Creating access token's lifetimes collection");
                accessTokenLifeTimesCollection = yield db.createCollection("accessTokenLifetimes");
            }
            else {
                accessTokenLifeTimesCollection = yield db.collection("accessTokenLifetimes");
            }
            // Create indices
            const hasLockSessionIndex = yield lockCollection.indexExists("lockSession");
            if (!hasLockSessionIndex) {
                yield lockCollection.createIndex({ sessionid: 1 }, { name: "lockSession", unique: true });
                util_1.logger.info("Created session index for lockSession collection");
            }
            const hasLockExpiryIndex = yield lockCollection.indexExists("lockExpiry");
            if (!hasLockExpiryIndex) {
                yield lockCollection.createIndex({ expireAt: 1 }, { name: "lockExpiry", expireAfterSeconds: 0 });
                util_1.logger.info("Created expiry index for lockSession collection");
            }
            for (const coll of [refreshTokenCollection, accessTokenLifeTimesCollection]) {
                const hasUserSessionIndex = yield coll.indexExists("userSession");
                if (!hasUserSessionIndex) {
                    yield coll.createIndex({ username: 1, sessionid: 1 }, { name: "userSession", unique: true });
                    util_1.logger.info(`Created username/session index for collection ${coll.collectionName}`);
                }
                const hasExpiryIndex = yield coll.indexExists("expiryIndex");
                if (!hasExpiryIndex) {
                    yield coll.createIndex({ expireAt: 1 }, { name: "expiryIndex", expireAfterSeconds: 0 });
                    util_1.logger.info(`Created index adding TTL for collection ${coll.collectionName}`);
                }
            }
        }
        catch (err) {
            util_1.logger.emerg("Error with database connection");
            util_1.logger.debug(err);
            process.exit(1);
        }
    });
}
/*
This function (and the corresponding releaseRefreshLock) provide basic
distributed locking capabilities using the expiry TTLs in mongodb, which
will hopefully be adequate for the purposes in use for here.
*/
function acquireRefreshLock(sessionid_1, expiresIn_1) {
    return __awaiter(this, arguments, void 0, function* (sessionid, expiresIn, numRetries = 40, msBetweenRetries = 500) {
        const expireAt = new Date(Date.now() + expiresIn * 1000);
        for (let i = 0; i < numRetries; i++) {
            try {
                // TTLs indexes are only garbage-collected every minute or so, so manually
                // purge any that have expired
                yield lockCollection.deleteMany({ expireAt: { $lt: new Date() } });
                yield lockCollection.insertOne({
                    sessionid,
                    expireAt
                });
                // No duplicate key error throw by above insert so got lock
                return true;
            }
            catch (e) {
                if (e.code !== 11000) {
                    // Not a duplicate key error (which would indicate a failure to acquire the lock)
                    util_1.logger.warning(e);
                }
            }
            // Wait the specified amount of time before trying again
            yield new Promise(resolve => {
                setTimeout(resolve, msBetweenRetries);
            });
        }
        // Failed to acquire lock despite hitting numRetries
        return false;
    });
}
function releaseRefreshLock(sessionid) {
    return __awaiter(this, void 0, void 0, function* () {
        // Delete lock record from DB
        try {
            const deleteResult = yield lockCollection.deleteOne({ sessionid });
            return deleteResult.acknowledged;
        }
        catch (e) {
            util_1.logger.warning(e);
            return false;
        }
    });
}
// A symmetric key is used to encrypt the refreshToken at rest, with the key
// only retained by the client
function getRefreshToken(username, sessionid, symmKey) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const record = yield refreshTokenCollection.findOne({
                username,
                sessionid
            });
            if ((record === null || record === void 0 ? void 0 : record.expireAt) < Date.now()) {
                // An already expired token that MongoDB hasn't clear out yet
                return;
            }
            const decipher = (0, crypto_1.createDecipheriv)("aes-256-cbc", symmKey, record === null || record === void 0 ? void 0 : record.iv.buffer);
            let decrypted = decipher.update(record === null || record === void 0 ? void 0 : record.refreshToken, "hex", "utf8");
            decrypted += decipher.final("utf8");
            return decrypted;
        }
        catch (e) {
            util_1.logger.error(e);
            return;
        }
    });
}
// A symmetric key is used to encrypt the refreshToken at rest, with the key
// only retained by the client
function setRefreshToken(username, sessionid, refreshToken, symmKey, expiresIn) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Encrypt the token so gaining access to mongo isn't enough to steal the refresh token
            const iv = (0, crypto_1.randomBytes)(16);
            const cipher = (0, crypto_1.createCipheriv)("aes-256-cbc", symmKey, iv);
            const encrypted = cipher.update(refreshToken, "utf8", "hex") + cipher.final("hex");
            const expireAt = new Date(Date.now() + expiresIn * 1000);
            const updateResult = yield refreshTokenCollection.updateOne({ username, sessionid }, {
                $set: {
                    expireAt,
                    refreshToken: encrypted,
                    iv: new mongodb_1.Binary(iv)
                }
            }, { upsert: true });
            return updateResult.acknowledged;
        }
        catch (e) {
            util_1.logger.error(e);
            return false;
        }
    });
}
function getAccessTokenExpiry(username, sessionid) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Lookup record in MongoDB using key
            const record = yield accessTokenLifeTimesCollection.findOne({
                username,
                sessionid
            });
            // Calculate expiry by subtracting the current time from stored key's expiry time
            const remaining = (0, lodash_1.floor)(((record === null || record === void 0 ? void 0 : record.expireAt.getTime()) - Date.now()) / 1000);
            if (remaining > 0) {
                return remaining;
            }
        }
        catch (e) {
            util_1.logger.error(e);
            // Return 0 if record not found or an unexpected error occurs
            return 0;
        }
        // Return 0 if record not found or an unexpected error occurs
        return 0;
    });
}
function setAccessTokenExpiry(username, sessionid, expiresIn) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const expireAt = new Date(Date.now() + expiresIn * 1000);
            const updateResult = yield accessTokenLifeTimesCollection.updateOne({ username, sessionid }, { $set: { expireAt } }, { upsert: true });
            return updateResult.acknowledged;
        }
        catch (e) {
            util_1.logger.error(e);
            return false;
        }
    });
}
function clearTokens(username, sessionid) {
    return __awaiter(this, void 0, void 0, function* () {
        yield Promise.all([accessTokenLifeTimesCollection.deleteOne({ username, sessionid }).catch(e => util_1.logger.error(e)), refreshTokenCollection.deleteOne({ username, sessionid }).catch(e => util_1.logger.error(e))]);
    });
}
//# sourceMappingURL=oidcRefreshManager.js.map