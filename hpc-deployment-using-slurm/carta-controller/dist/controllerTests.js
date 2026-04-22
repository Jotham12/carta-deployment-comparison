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
exports.runTests = runTests;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const ldapauth_fork_1 = __importDefault(require("ldapauth-fork"));
const logSymbols = __importStar(require("log-symbols"));
const moment_1 = __importDefault(require("moment"));
const mongodb_1 = require("mongodb");
const path = __importStar(require("path"));
const websocket_1 = require("websocket");
const backendLaunch_1 = require("./backendLaunch");
const local_1 = require("./auth/local");
const config_1 = require("./config");
const util_1 = require("./util");
const read = require("read");
function runTests(username) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        util_1.logger.info(`Testing configuration with user ${config_1.testUser}`);
        if ((_a = config_1.ServerConfig.authProviders) === null || _a === void 0 ? void 0 : _a.ldap) {
            yield testLdap(config_1.ServerConfig.authProviders.ldap, username);
            testUid(username);
            testToken(config_1.ServerConfig.authProviders.ldap, username);
        }
        else if ((_b = config_1.ServerConfig.authProviders) === null || _b === void 0 ? void 0 : _b.pam) {
            yield testPam(config_1.ServerConfig.authProviders.pam, username);
            testUid(username);
            testToken(config_1.ServerConfig.authProviders.pam, username);
        }
        yield testDatabase();
        if (config_1.ServerConfig.backendLogFileTemplate) {
            yield testLog(username);
        }
        testFrontend();
        const backendProcess = yield testBackendStartup(username);
        yield testKillScript(username, backendProcess);
    });
}
function testLog(username) {
    return __awaiter(this, void 0, void 0, function* () {
        const logLocation = config_1.ServerConfig.backendLogFileTemplate.replace("{username}", username).replace("{pid}", "9999").replace("{datetime}", (0, moment_1.default)().format("YYYYMMDD.h_mm_ss"));
        try {
            const logStream = fs.createWriteStream(logLocation, { flags: "a" });
            // Transform callbacks into awaits
            yield new Promise(res => logStream.write("test", res));
            yield new Promise(res => logStream.end(res));
            fs.unlinkSync(logLocation);
            util_1.logger.info(`${logSymbols.success} Checked log writing for user ${username}`);
        }
        catch (err) {
            util_1.logger.debug(err);
            throw new Error(`Could not create log file at ${logLocation} for user ${username}. Please check your config file's backendLogFileTemplate option`);
        }
    });
}
function testLdap(authConf, username) {
    return new Promise((resolve, reject) => {
        if (authConf) {
            let ldap;
            try {
                ldap = new ldapauth_fork_1.default(authConf.ldapOptions);
                setTimeout(() => {
                    read({ prompt: `Password for user ${username}:`, silent: true }).then(password => {
                        ldap.authenticate(username, password, (error, user) => {
                            if (error) {
                                util_1.logger.debug(error);
                                reject(new Error(`Could not authenticate as user ${username}. Please check your config file's ldapOptions section!`));
                            }
                            else {
                                util_1.logger.info(`${logSymbols.success} Checked LDAP connection for user ${username}`);
                                if ((user === null || user === void 0 ? void 0 : user.uid) !== username) {
                                    util_1.logger.warning(`${logSymbols.warning} Returned user "uid ${user === null || user === void 0 ? void 0 : user.uid}" does not match username "${username}"`);
                                    util_1.logger.debug(user);
                                }
                                resolve();
                            }
                        });
                    });
                }, 5000);
            }
            catch (e) {
                util_1.logger.debug(e);
                reject(new Error("Cannot create LDAP object. Please check your config file's ldapOptions section!"));
            }
        }
    });
}
function testPam(authConf, username) {
    const { pamAuthenticate } = require("node-linux-pam");
    return new Promise((resolve, reject) => {
        if (authConf) {
            read({ prompt: `Password for user ${username}:`, silent: true }).then(password => {
                pamAuthenticate({ username, password }, (err, code) => {
                    if (err) {
                        util_1.logger.debug(err);
                        reject(new Error(`Could not authenticate as user ${username}. Error code ${code}`));
                    }
                    else {
                        util_1.logger.info(`${logSymbols.success} Checked PAM connection for user ${username}`);
                        resolve();
                    }
                });
            });
        }
    });
}
function testDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const client = yield mongodb_1.MongoClient.connect(config_1.ServerConfig.database.uri);
            const db = yield client.db(config_1.ServerConfig.database.databaseName);
            yield db.listCollections({}, { nameOnly: true }).hasNext();
        }
        catch (e) {
            util_1.logger.debug(e);
            throw new Error("Cannot connect to MongoDB. Please check your config file's database section!");
        }
        util_1.logger.info(`${logSymbols.success} Checked database connection`);
    });
}
function testUid(username) {
    let uid;
    try {
        uid = (0, util_1.getUserId)(username);
    }
    catch (e) {
        util_1.logger.debug(e);
        throw new Error(`Cannot verify uid of user ${username}`);
    }
    util_1.logger.info(`${logSymbols.success} Verified uid (${uid}) for user ${username}`);
}
function testToken(authConf, username) {
    let token;
    try {
        token = (0, local_1.generateToken)(authConf, username, local_1.TokenType.Access);
    }
    catch (e) {
        util_1.logger.debug(e);
        throw new Error("Cannot generate access token. Please check your config file's auth section!");
    }
    if (!token) {
        throw new Error("Invalid access token. Please check your config file's auth section!");
    }
    util_1.logger.info(`${logSymbols.success} Generated access token for user ${username}`);
}
function testFrontend() {
    if (!config_1.ServerConfig.frontendPath) {
        config_1.ServerConfig.frontendPath = path.join(__dirname, "../node_modules/carta-frontend/build");
    }
    let indexContents;
    try {
        indexContents = fs.readFileSync(config_1.ServerConfig.frontendPath + "/index.html").toString();
    }
    catch (e) {
        util_1.logger.debug(e);
        throw new Error(`Cannot access frontend at ${config_1.ServerConfig.frontendPath}`);
    }
    if (!indexContents) {
        throw new Error(`Invalid frontend at ${config_1.ServerConfig.frontendPath}`);
    }
    else {
        util_1.logger.info(`${logSymbols.success} Read frontend index.html from ${config_1.ServerConfig.frontendPath}`);
    }
}
function testBackendStartup(username) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const port = config_1.ServerConfig.backendPorts.max - 1;
        const { topLevelFolder, baseFolder } = (0, util_1.getUserFolders)(config_1.ServerConfig.rootFolderTemplate, config_1.ServerConfig.baseFolderTemplate, username);
        let args = [];
        if (config_1.ServerConfig.preserveEnv) {
            args.push("--preserve-env=CARTA_AUTH_TOKEN");
        }
        args = args.concat([
            "-n", // run non-interactively. If password is required, sudo will bail
            "-u",
            `${username}`,
            config_1.ServerConfig.processCommand,
            ...(0, backendLaunch_1.buildBackendArgv)({
                port,
                topLevelFolder,
                baseFolder,
                additionalArgs: ["--debug_no_auth", ...((_a = config_1.ServerConfig.additionalArgs) !== null && _a !== void 0 ? _a : [])],
                disableLog: Boolean(config_1.ServerConfig.backendLogFileTemplate)
            })
        ]);
        util_1.logger.debug(`running sudo ${args.join(" ")}`);
        // Use same stdout and stderr stream for the backend process
        const backendProcess = (0, child_process_1.spawn)("sudo", args, { stdio: "inherit" });
        yield (0, util_1.delay)(2000);
        if (backendProcess.signalCode) {
            throw new Error(`Backend process terminated with code ${backendProcess.signalCode}. Please check your sudoers config, processCommand option and additionalArgs section`);
        }
        else {
            util_1.logger.info(`${logSymbols.success} Backend process started successfully`);
        }
        const wsClient = new websocket_1.client();
        let wsConnected = false;
        wsClient.on("connect", () => {
            wsConnected = true;
        });
        wsClient.on("connectFailed", e => {
            util_1.logger.debug(e);
        });
        wsClient.connect(`ws://localhost:${port}`);
        yield (0, util_1.delay)(1000);
        if (wsConnected) {
            util_1.logger.info(`${logSymbols.success} Backend process accepted connection`);
        }
        else {
            throw new Error("Cannot connect to backend process. Please check your additionalArgs section. If sudo is prompting you for a password, please check your sudoers config");
        }
        return backendProcess;
    });
}
function testKillScript(username, existingProcess) {
    return __awaiter(this, void 0, void 0, function* () {
        if (existingProcess.signalCode) {
            throw new Error(`Backend process already killed, signal code ${existingProcess.signalCode}`);
        }
        const args = ["-u", `${username}`, config_1.ServerConfig.killCommand, `${existingProcess.pid}`];
        util_1.logger.debug(`running sudo ${args.join(" ")}`);
        const res = (0, child_process_1.spawnSync)("sudo", args, { encoding: "utf8" });
        if (res.error) {
            util_1.logger.debug(res.error);
            util_1.logger.debug(`stdout:\t${res.stdout}`);
            util_1.logger.debug(`stderr:\t${res.stderr}`);
        }
        if (res.status) {
            throw new Error(`Cannot execute kill script (error status ${res.status}. Please check your killCommand option`);
        }
        // Delay to allow the parent process to exit
        yield (0, util_1.delay)(1000);
        if (existingProcess.signalCode === "SIGKILL") {
            util_1.logger.info(`${logSymbols.success} Backend process killed correctly`);
        }
        else {
            throw new Error("Failed to kill process. Please check your killCommand option. If sudo is prompting you for a password, please check your sudoers config");
        }
    });
}
//# sourceMappingURL=controllerTests.js.map