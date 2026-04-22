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
exports.logger = void 0;
exports.delay = delay;
exports.noCache = noCache;
exports.getUserId = getUserId;
exports.getUserFolders = getUserFolders;
const node_child_process_1 = require("node:child_process");
const winston_1 = __importDefault(require("winston"));
exports.logger = winston_1.default.createLogger({
    // Detailed setup is completed in config.ts
    levels: winston_1.default.config.syslog.levels
});
// Delay for the specified number of milliseconds
function delay(delay) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => {
            setTimeout(() => resolve(), delay);
        });
    });
}
function noCache(_req, res, next) {
    res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.header("Expires", "-1");
    res.header("Pragma", "no-cache");
    next();
}
function getUserId(username) {
    if (!username) {
        throw new Error("Missing argument for username");
    }
    const result = (0, node_child_process_1.spawnSync)("id", ["-u", username]);
    if (!result.status && (result === null || result === void 0 ? void 0 : result.stdout)) {
        const uid = Number.parseInt(result.stdout.toString());
        if (Number.isFinite(uid)) {
            return uid;
        }
    }
    throw new Error(`Can't find uid for username ${username}`);
}
function normalizePath(filePath) {
    if (filePath.length > 1 && filePath.endsWith("/")) {
        return filePath.replace(/\/+$/, "") || "/";
    }
    return filePath;
}
function getUserScopedFolder(template, username) {
    const placeholder = "{username}";
    const placeholderIndex = template.indexOf(placeholder);
    if (placeholderIndex < 0) {
        return undefined;
    }
    const prefix = template.slice(0, placeholderIndex);
    const suffix = template.slice(placeholderIndex + placeholder.length);
    const suffixSeparatorIndex = suffix.indexOf("/");
    const userScopedSuffix = suffixSeparatorIndex >= 0 ? suffix.slice(0, suffixSeparatorIndex) : suffix;
    return normalizePath(`${prefix}${username}${userScopedSuffix}`);
}
function getUserFolders(rootFolderTemplate, baseFolderTemplate, username) {
    const rootFolder = normalizePath(rootFolderTemplate.split("{username}").join(username));
    const baseFolder = normalizePath(baseFolderTemplate.split("{username}").join(username));
    return {
        topLevelFolder: rootFolder,
        baseFolder
    };
}
//# sourceMappingURL=util.js.map
