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
exports.databaseRouter = void 0;
exports.initDB = initDB;
exports.getBackendSession = getBackendSession;
exports.upsertBackendSession = upsertBackendSession;
exports.deleteBackendSession = deleteBackendSession;
exports.listBackendSessions = listBackendSessions;
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const express_1 = __importDefault(require("express"));
const mongodb_1 = require("mongodb");
const auth_1 = require("./auth");
const config_1 = require("./config");
const util_1 = require("./util");
const PREFERENCE_SCHEMA_VERSION = 2;
const LAYOUT_SCHEMA_VERSION = 2;
const SNIPPET_SCHEMA_VERSION = 1;
const WORKSPACE_SCHEMA_VERSION = 0;
const preferenceSchema = require("../schemas/preferences_schema_2.json");
const layoutSchema = require("../schemas/layout_schema_2.json");
const snippetSchema = require("../schemas/snippet_schema_1.json");
const workspaceSchema = require("../schemas/workspace_schema_1.json");
const ajv = new ajv_1.default({ useDefaults: true, strictTypes: false });
(0, ajv_formats_1.default)(ajv);
const validatePreferences = ajv.compile(preferenceSchema);
const validateLayout = ajv.compile(layoutSchema);
const validateSnippet = ajv.compile(snippetSchema);
const validateWorkspace = ajv.compile(workspaceSchema);
let client;
let preferenceCollection;
let layoutsCollection;
let snippetsCollection;
let workspacesCollection;
let backendSessionsCollection;
function updateUsernameIndex(collection, unique) {
    return __awaiter(this, void 0, void 0, function* () {
        const hasIndex = yield collection.indexExists("username");
        if (!hasIndex) {
            yield collection.createIndex({ username: 1 }, { name: "username", unique });
            util_1.logger.info(`Created username index for collection ${collection.collectionName}`);
        }
    });
}
function createOrGetCollection(db, collectionName) {
    return __awaiter(this, void 0, void 0, function* () {
        const collectionExists = yield db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
        if (collectionExists) {
            return db.collection(collectionName);
        }
        else {
            util_1.logger.info(`Creating collection ${collectionName}`);
            return db.createCollection(collectionName);
        }
    });
}
function initDB() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (((_a = config_1.ServerConfig.database) === null || _a === void 0 ? void 0 : _a.uri) && ((_b = config_1.ServerConfig.database) === null || _b === void 0 ? void 0 : _b.databaseName)) {
            try {
                client = yield mongodb_1.MongoClient.connect(config_1.ServerConfig.database.uri);
                const db = yield client.db(config_1.ServerConfig.database.databaseName);
                layoutsCollection = yield createOrGetCollection(db, "layouts");
                snippetsCollection = yield createOrGetCollection(db, "snippets");
                preferenceCollection = yield createOrGetCollection(db, "preferences");
                workspacesCollection = yield createOrGetCollection(db, "workspaces");
                backendSessionsCollection = yield createOrGetCollection(db, "backendSessions");
                // Remove any existing validation in preferences collection
                yield db.command({
                    collMod: "preferences",
                    validator: {},
                    validationLevel: "off"
                });
                // Update collection indices if necessary
                yield updateUsernameIndex(layoutsCollection, false);
                yield updateUsernameIndex(snippetsCollection, false);
                yield updateUsernameIndex(workspacesCollection, false);
                yield updateUsernameIndex(preferenceCollection, true);
                yield updateUsernameIndex(backendSessionsCollection, true);
                util_1.logger.info(`Connected to ${config_1.ServerConfig.database.databaseName} at ${config_1.ServerConfig.database.uri}`);
            }
            catch (err) {
                console.error(err && err.stack ? err.stack : err);
                util_1.logger.debug(err);
                util_1.logger.emerg("Error connecting to database");
                process.exit(1);
            }
        }
        else {
            util_1.logger.emerg("Database configuration not found");
            process.exit(1);
        }
    });
}
function getBackendSessionsCollection() {
    if (!backendSessionsCollection) {
        throw new Error("Database not configured");
    }
    return backendSessionsCollection;
}
function getBackendSession(username) {
    return __awaiter(this, void 0, void 0, function* () {
        return getBackendSessionsCollection().findOne({ username });
    });
}
function upsertBackendSession(session) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getBackendSessionsCollection().updateOne({ username: session.username }, { $set: session }, { upsert: true });
    });
}
function deleteBackendSession(username) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getBackendSessionsCollection().deleteOne({ username });
    });
}
function listBackendSessions() {
    return __awaiter(this, void 0, void 0, function* () {
        return getBackendSessionsCollection().find({}).toArray();
    });
}
function handleGetPreferences(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!preferenceCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        try {
            const doc = yield preferenceCollection.findOne({ username: req.username }, { projection: { _id: 0, username: 0 } });
            if (doc) {
                const isValid = validatePreferences(doc);
                if (!isValid) {
                    util_1.logger.warning(`Returning invalid preferences:\n${validatePreferences.errors}`);
                }
                res.json({ success: true, preferences: doc });
            }
            else {
                return next({
                    statusCode: 500,
                    message: "Problem retrieving preferences"
                });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: "Problem retrieving preferences" });
        }
    });
}
function handleSetPreferences(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!preferenceCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const update = req.body;
        // Check for malformed update
        if (!update || !Object.keys(update).length || update.username || update._id) {
            return next({ statusCode: 400, message: "Malformed preference update" });
        }
        update.version = PREFERENCE_SCHEMA_VERSION;
        const validUpdate = validatePreferences(update);
        if (!validUpdate) {
            util_1.logger.warning(`Rejecting invalid preference update:\n${validatePreferences.errors}`);
            return next({ statusCode: 400, message: "Invalid preference update" });
        }
        try {
            const updateResult = yield preferenceCollection.updateOne({ username: req.username }, { $set: update }, { upsert: true });
            if (updateResult.acknowledged) {
                res.json({ success: true });
            }
            else {
                return next({ statusCode: 500, message: "Problem updating preferences" });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: err.errmsg });
        }
    });
}
function handleClearPreferences(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!preferenceCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const keys = (_a = req.body) === null || _a === void 0 ? void 0 : _a.keys;
        // Check for malformed update
        if (!keys || !Array.isArray(keys) || !keys.length) {
            return next({ statusCode: 400, message: "Malformed key list" });
        }
        const update = {};
        for (const key of keys) {
            update[key] = "";
        }
        try {
            const updateResult = yield preferenceCollection.updateOne({ username: req.username }, { $unset: update });
            if (updateResult.acknowledged) {
                res.json({ success: true });
            }
            else {
                return next({ statusCode: 500, message: "Problem clearing preferences" });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: "Problem clearing preferences" });
        }
    });
}
function handleGetLayouts(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!layoutsCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        try {
            const layoutList = yield layoutsCollection.find({ username: req.username }, { projection: { _id: 0, username: 0 } }).toArray();
            const layouts = {};
            for (const entry of layoutList) {
                if (entry.name && entry.layout) {
                    const isValid = validateLayout(entry.layout);
                    if (!isValid) {
                        util_1.logger.warning(`Returning invalid layout '${entry.name}':\n${validateLayout.errors}`);
                    }
                    layouts[entry.name] = entry.layout;
                }
            }
            res.json({ success: true, layouts });
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: "Problem retrieving layouts" });
        }
    });
}
function handleSetLayout(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!layoutsCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const layoutName = (_a = req.body) === null || _a === void 0 ? void 0 : _a.layoutName;
        const layout = (_b = req.body) === null || _b === void 0 ? void 0 : _b.layout;
        // Check for malformed update
        if (!layoutName || !layout || layout.layoutVersion !== LAYOUT_SCHEMA_VERSION) {
            return next({ statusCode: 400, message: "Malformed layout update" });
        }
        const validUpdate = validateLayout(layout);
        if (!validUpdate) {
            util_1.logger.warning(`Rejecting invalid layout update:\n${validateLayout.errors}`);
            return next({ statusCode: 400, message: "Invalid layout update" });
        }
        try {
            const updateResult = yield layoutsCollection.updateOne({ username: req.username, name: layoutName, layout }, { $set: { layout } }, { upsert: true });
            if (updateResult.acknowledged) {
                res.json({ success: true });
            }
            else {
                return next({ statusCode: 500, message: "Problem updating layout" });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: err.errmsg });
        }
    });
}
function handleClearLayout(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!layoutsCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const layoutName = (_a = req.body) === null || _a === void 0 ? void 0 : _a.layoutName;
        try {
            const deleteResult = yield layoutsCollection.deleteOne({
                username: req.username,
                name: layoutName
            });
            if (deleteResult.acknowledged) {
                res.json({ success: true });
            }
            else {
                return next({ statusCode: 500, message: "Problem clearing layout" });
            }
        }
        catch (err) {
            util_1.logger.error(err);
            return next({ statusCode: 500, message: "Problem clearing layout" });
        }
    });
}
function handleGetSnippets(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!snippetsCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        try {
            const snippetList = yield snippetsCollection.find({ username: req.username }, { projection: { _id: 0, username: 0 } }).toArray();
            const snippets = {};
            for (const entry of snippetList) {
                if (entry.name && entry.snippet) {
                    const isValid = validateSnippet(entry.snippet);
                    if (!isValid) {
                        util_1.logger.warning(`Returning invalid snippet '${entry.name}':\n${validateSnippet.errors}`);
                    }
                    snippets[entry.name] = entry.snippet;
                }
            }
            res.json({ success: true, snippets });
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: "Problem retrieving snippets" });
        }
    });
}
function handleSetSnippet(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!snippetsCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const snippetName = (_a = req.body) === null || _a === void 0 ? void 0 : _a.snippetName;
        const snippet = (_b = req.body) === null || _b === void 0 ? void 0 : _b.snippet;
        // Check for malformed update
        if (!snippetName || !snippet || snippet.snippetVersion !== SNIPPET_SCHEMA_VERSION) {
            return next({ statusCode: 400, message: "Malformed snippet update" });
        }
        const validUpdate = validateSnippet(snippet);
        if (!validUpdate) {
            util_1.logger.error(`Rejecting invalid snippet update:\n${validateSnippet.errors}`);
            return next({ statusCode: 400, message: "Invalid snippet update" });
        }
        try {
            const updateResult = yield snippetsCollection.updateOne({ username: req.username, name: snippetName, snippet }, { $set: { snippet } }, { upsert: true });
            if (updateResult.acknowledged) {
                res.json({ success: true });
            }
            else {
                return next({ statusCode: 500, message: "Problem updating snippet" });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: err.errmsg });
        }
    });
}
function handleClearSnippet(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!snippetsCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const snippetName = (_a = req.body) === null || _a === void 0 ? void 0 : _a.snippetName;
        try {
            const deleteResult = yield snippetsCollection.deleteOne({
                username: req.username,
                name: snippetName
            });
            if (deleteResult.acknowledged) {
                res.json({ success: true });
            }
            else {
                return next({ statusCode: 500, message: "Problem clearing snippet" });
            }
        }
        catch (err) {
            util_1.logger.error(err);
            return next({ statusCode: 500, message: "Problem clearing snippet" });
        }
    });
}
function handleClearWorkspace(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!workspacesCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const workspaceName = (_a = req.body) === null || _a === void 0 ? void 0 : _a.workspaceName;
        // TODO: handle CRUD with workspace ID instead of name
        const workspaceId = (_b = req.body) === null || _b === void 0 ? void 0 : _b.id;
        try {
            const deleteResult = yield workspacesCollection.deleteOne({
                username: req.username,
                name: workspaceName
            });
            if (deleteResult.acknowledged) {
                res.json({ success: true });
            }
            else {
                return next({ statusCode: 500, message: "Problem clearing workspace" });
            }
        }
        catch (err) {
            util_1.logger.error(err);
            return next({ statusCode: 500, message: "Problem clearing workspace" });
        }
    });
}
function handleGetWorkspaceList(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!workspacesCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        try {
            const workspaceList = yield workspacesCollection.find({ username: req.username }, { projection: { _id: 1, name: 1, "workspace.date": 1 } }).toArray();
            const workspaces = (_a = workspaceList === null || workspaceList === void 0 ? void 0 : workspaceList.map(w => {
                var _a;
                return (Object.assign(Object.assign({}, w), { id: w._id, date: (_a = w.workspace) === null || _a === void 0 ? void 0 : _a.date }));
            })) !== null && _a !== void 0 ? _a : [];
            res.json({ success: true, workspaces });
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: "Problem retrieving workspaces" });
        }
    });
}
function handleGetWorkspaceByName(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!((_a = req.params) === null || _a === void 0 ? void 0 : _a.name)) {
            return next({ statusCode: 403, message: "Invalid workspace name" });
        }
        if (!workspacesCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        try {
            const queryResult = yield workspacesCollection.findOne({ username: req.username, name: req.params.name }, { projection: { username: 0 } });
            if (!(queryResult === null || queryResult === void 0 ? void 0 : queryResult.workspace)) {
                return next({ statusCode: 404, message: "Workspace not found" });
            }
            else {
                const workspace = Object.assign({ id: queryResult._id, name: queryResult.name, editable: true }, queryResult.workspace);
                const isValid = validateWorkspace(workspace);
                if (!isValid) {
                    util_1.logger.warning(`Returning invalid workspace '${workspace.name}':\n${validateWorkspace.errors}`);
                }
                res.json({ success: true, workspace: workspace });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: "Problem retrieving workspace" });
        }
    });
}
function handleGetWorkspaceByKey(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!((_a = req.params) === null || _a === void 0 ? void 0 : _a.key)) {
            return next({ statusCode: 403, message: "Invalid workspace id" });
        }
        if (!workspacesCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        try {
            const objectId = Buffer.from(req.params.key, "base64url").toString("hex");
            const queryResult = yield workspacesCollection.findOne({
                _id: new mongodb_1.ObjectId(objectId)
            });
            if (!(queryResult === null || queryResult === void 0 ? void 0 : queryResult.workspace)) {
                return next({ statusCode: 404, message: "Workspace not found" });
            }
            else if (queryResult.username !== req.username && !queryResult.shared) {
                return next({ statusCode: 403, message: "Workspace not accessible" });
            }
            else {
                const workspace = Object.assign({ id: queryResult._id, name: queryResult.name, editable: queryResult.username === req.username }, queryResult.workspace);
                const isValid = validateWorkspace(workspace);
                if (!isValid) {
                    util_1.logger.warning(`Returning invalid workspace '${workspace.name}':\n${validateWorkspace.errors}`);
                }
                res.json({ success: true, workspace: workspace });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: "Problem retrieving workspace" });
        }
    });
}
function handleSetWorkspace(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        if (!workspacesCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        const workspaceName = (_a = req.body) === null || _a === void 0 ? void 0 : _a.workspaceName;
        const workspace = (_b = req.body) === null || _b === void 0 ? void 0 : _b.workspace;
        // Check for malformed update
        if (!workspaceName || !workspace || workspace.workspaceVersion !== WORKSPACE_SCHEMA_VERSION) {
            return next({ statusCode: 400, message: "Malformed workspace update" });
        }
        const validUpdate = validateWorkspace(workspace);
        if (!validUpdate) {
            util_1.logger.error(`Rejecting invalid workspace update:\n${validateWorkspace.errors}`);
            return next({ statusCode: 400, message: "Invalid workspace update" });
        }
        try {
            const updateResult = yield workspacesCollection.findOneAndUpdate({ username: req.username, name: workspaceName }, { $set: { workspace } }, { upsert: true, returnDocument: "after" });
            if (updateResult.ok && updateResult.value) {
                res.json({
                    success: true,
                    workspace: Object.assign(Object.assign({}, workspace), { id: updateResult.value._id.toString(), editable: true, name: workspaceName })
                });
                return;
            }
            else {
                return next({ statusCode: 500, message: "Problem updating workspace" });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: err.errmsg });
        }
    });
}
function handleShareWorkspace(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        const id = req.params.id;
        if (!id) {
            return next({ statusCode: 403, message: "Invalid workspace id" });
        }
        if (!workspacesCollection) {
            return next({ statusCode: 501, message: "Database not configured" });
        }
        try {
            const updateResult = yield workspacesCollection.findOneAndUpdate({ _id: new mongodb_1.ObjectId(id) }, { $set: { shared: true } });
            if (updateResult.ok) {
                const shareKey = Buffer.from(id, "hex").toString("base64url");
                res.json({ success: true, id, shareKey });
            }
            else {
                return next({ statusCode: 500, message: "Problem sharing workspace" });
            }
        }
        catch (err) {
            util_1.logger.debug(err);
            return next({ statusCode: 500, message: err.errmsg });
        }
    });
}
exports.databaseRouter = express_1.default.Router();
exports.databaseRouter.get("/preferences", auth_1.authGuard, util_1.noCache, handleGetPreferences);
exports.databaseRouter.put("/preferences", auth_1.authGuard, util_1.noCache, handleSetPreferences);
exports.databaseRouter.delete("/preferences", auth_1.authGuard, util_1.noCache, handleClearPreferences);
exports.databaseRouter.get("/layouts", auth_1.authGuard, util_1.noCache, handleGetLayouts);
exports.databaseRouter.put("/layout", auth_1.authGuard, util_1.noCache, handleSetLayout);
exports.databaseRouter.delete("/layout", auth_1.authGuard, util_1.noCache, handleClearLayout);
exports.databaseRouter.get("/snippets", auth_1.authGuard, util_1.noCache, handleGetSnippets);
exports.databaseRouter.put("/snippet", auth_1.authGuard, util_1.noCache, handleSetSnippet);
exports.databaseRouter.delete("/snippet", auth_1.authGuard, util_1.noCache, handleClearSnippet);
exports.databaseRouter.post("/share/workspace/:id", auth_1.authGuard, util_1.noCache, handleShareWorkspace);
exports.databaseRouter.get("/list/workspaces", auth_1.authGuard, util_1.noCache, handleGetWorkspaceList);
exports.databaseRouter.get("/workspace/key/:key", auth_1.authGuard, util_1.noCache, handleGetWorkspaceByKey);
exports.databaseRouter.get("/workspace/:name", auth_1.authGuard, util_1.noCache, handleGetWorkspaceByName);
exports.databaseRouter.put("/workspace", auth_1.authGuard, util_1.noCache, handleSetWorkspace);
exports.databaseRouter.delete("/workspace", auth_1.authGuard, util_1.noCache, handleClearWorkspace);
//# sourceMappingURL=database.js.map
