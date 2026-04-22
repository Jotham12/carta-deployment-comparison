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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.testUser = exports.RuntimeConfig = exports.ServerConfig = void 0;
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const fs = __importStar(require("fs"));
const JSONC = __importStar(require("jsonc-parser"));
const lodash_1 = __importDefault(require("lodash"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const path = __importStar(require("path"));
const url = __importStar(require("url"));
const winston_1 = __importDefault(require("winston"));
const yargs_1 = __importDefault(require("yargs"));
const util_1 = require("./util");
let timeZone;
const customTimestamp = () => {
    if (timeZone)
        return (0, moment_timezone_1.default)().tz(timeZone).format("YYYY-MM-DD HH:mm:ss");
    else
        return (0, moment_timezone_1.default)().format("YYYY-MM-DD HH:mm:ss");
};
// Different log formats
const logTextFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: customTimestamp }), winston_1.default.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
}));
const logColorTextFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: customTimestamp }), winston_1.default.format.printf(({ level, message, timestamp }) => {
    const colorizer = winston_1.default.format.colorize();
    return `${timestamp} [${colorizer.colorize(level, level.toUpperCase())}]: ${message}`;
}));
const logJsonFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: customTimestamp }), winston_1.default.format.json());
const defaultConfigPath = "/etc/carta/config.json";
const argv = yargs_1.default
    .parserConfiguration({
    "short-option-groups": false
})
    .options({
    config: {
        type: "string",
        default: defaultConfigPath,
        alias: "c",
        description: "Path to config file in JSON format"
    },
    test: {
        type: "string",
        alias: "t",
        requiresArg: true,
        description: "Test configuration with the provided user"
    },
    logLevel: {
        type: "string",
        choices: ["none", "emerg", "alert", "crit", "error", "warning", "notice", "info", "debug"],
        describe: "Log level to print to console",
        alias: "l"
    },
    logFormat: {
        type: "string",
        choices: ["text", "json"],
        describe: "Log type to print to console",
        alias: "f"
    }
}).argv;
const usingCustomConfig = argv.config !== defaultConfigPath;
const testUser = argv.test;
exports.testUser = testUser;
const configSchema = require("../schemas/controller_config_schema_2.json");
const ajv = new ajv_1.default({ useDefaults: false });
const ajvWithDefaults = new ajv_1.default({ useDefaults: true });
(0, ajv_formats_1.default)(ajv);
(0, ajv_formats_1.default)(ajvWithDefaults);
const validateConfig = ajv.compile(configSchema);
const validateAndAddDefaults = ajvWithDefaults.compile(configSchema);
let serverConfig;
const consoleTransport = new winston_1.default.transports.Console({
    format: argv.logFormat === "json" ? logJsonFormat : logColorTextFormat,
    level: argv.logLevel ? argv.logLevel : "info", // default to info until having parsed the config
    silent: argv.logLevel === "none"
});
util_1.logger.add(consoleTransport);
try {
    const configFiles = [];
    if (fs.existsSync(argv.config)) {
        configFiles.push(argv.config);
        const jsonString = fs.readFileSync(argv.config).toString();
        exports.ServerConfig = serverConfig = JSONC.parse(jsonString);
    }
    else {
        if (!usingCustomConfig) {
            exports.ServerConfig = serverConfig = {};
            util_1.logger.warning(`Skipping missing config file ${defaultConfigPath}`);
        }
        else {
            util_1.logger.crit(`Unable to find config file ${argv.config}`);
            process.exit(1);
        }
    }
    const configDir = path.join(path.dirname(argv.config), "config.d");
    if (fs.existsSync(configDir)) {
        const files = (_a = fs.readdirSync(configDir)) === null || _a === void 0 ? void 0 : _a.sort();
        for (const file of files) {
            if (!file.match(/.*\.json$/)) {
                console.warn(`Skipping ${file}`);
                continue;
            }
            const jsonString = fs.readFileSync(path.join(configDir, file)).toString();
            const additionalConfig = JSONC.parse(jsonString);
            const isPartialConfigValid = validateConfig(additionalConfig);
            if (isPartialConfigValid) {
                exports.ServerConfig = serverConfig = lodash_1.default.merge(serverConfig, additionalConfig);
                configFiles.push(file);
            }
            else {
                util_1.logger.error(`Skipping invalid configuration file ${file}`);
                util_1.logger.error(validateConfig.errors);
            }
        }
    }
    // Check for use of deprecated logFileTemplate
    if ("logFileTemplate" in serverConfig) {
        util_1.logger.warning("The 'logFileTemplate' option is deprecated and renamed to 'backendLogFileTemplate'. Please update your config file.");
        if (!serverConfig.backendLogFileTemplate || serverConfig.backendLogFileTemplate === "") {
            serverConfig.backendLogFileTemplate = String(serverConfig.logFileTemplate);
        }
        else if (serverConfig.backendLogFileTemplate !== serverConfig.logFileTemplate) {
            util_1.logger.error("'logFileTemplate' and 'backendLogFileTemplate' are both set, and have conflicting values. Ignoring 'logFileTemplate'.");
        }
        delete serverConfig.logFileTemplate;
    }
    const isValid = validateAndAddDefaults(serverConfig);
    if (!isValid) {
        console.error(validateAndAddDefaults.errors);
        process.exit(1);
    }
    // Validate timezone setting
    if (serverConfig.timezone) {
        try {
            new Intl.DateTimeFormat("en-US", { timeZone: serverConfig.timezone });
            timeZone = serverConfig.timezone;
        }
        catch (err) {
            util_1.logger.error(`Ignoring invalid timezone "${serverConfig.timezone}" in config file`);
        }
    }
    // Reconfigure log transports
    if (argv.logLevel) {
        serverConfig.logLevelConsole = argv.logLevel;
    }
    if (argv.logFormat) {
        serverConfig.logTypeConsole = argv.logFormat;
    }
    consoleTransport.level = serverConfig.logLevelConsole;
    consoleTransport.format = serverConfig.logTypeConsole === "json" ? logJsonFormat : logColorTextFormat;
    consoleTransport.silent = serverConfig.logLevelConsole === "none";
    if (serverConfig.logFile && serverConfig.logFile !== "") {
        if (serverConfig.logLevelFile === "none") {
            util_1.logger.error(`Log file "${serverConfig.logFile}" specified but with a log level of "none"`);
        }
        else {
            try {
                util_1.logger.add(new winston_1.default.transports.File({
                    level: serverConfig.logLevelFile,
                    filename: serverConfig.logFile,
                    format: serverConfig.logTypeFile === "json" ? logJsonFormat : logTextFormat
                }));
                util_1.logger.info(`Started logging to ${serverConfig.logFile}`);
            }
            catch (err) {
                util_1.logger.debug(err);
                util_1.logger.error(`Error initializing logging to ${serverConfig.logFile}`);
                // Server currently continues to run
            }
        }
    }
    util_1.logger.info(`Loaded config from ${configFiles.join(", ")}`);
}
catch (err) {
    util_1.logger.emerg(err);
    process.exit(1);
}
// Check defaults:
if (!serverConfig.rootFolderTemplate) {
    console.log("No top-level folder was specified. Reverting to default location");
    const defaultFolders = ["/usr/share/carta", "/usr/local/share/carta"];
    for (const f of defaultFolders) {
        if (fs.existsSync(f)) {
            serverConfig.rootFolderTemplate = f;
            break;
        }
    }
    if (!serverConfig.rootFolderTemplate) {
        console.error("Could not find a default top-level folder!");
        process.exit(1);
    }
}
if (!serverConfig.baseFolderTemplate) {
    serverConfig.baseFolderTemplate = serverConfig.rootFolderTemplate;
}
// Construct runtime config
const runtimeConfig = {};
exports.RuntimeConfig = runtimeConfig;
runtimeConfig.dashboardAddress = serverConfig.dashboardAddress || "/dashboard";
runtimeConfig.apiAddress = serverConfig.apiAddress || "/api";
if (serverConfig.authProviders.external) {
    runtimeConfig.tokenRefreshAddress = serverConfig.authProviders.external.tokenRefreshAddress;
    runtimeConfig.logoutAddress = serverConfig.authProviders.external.logoutAddress;
}
else {
    runtimeConfig.tokenRefreshAddress = runtimeConfig.apiAddress + "/auth/refresh";
    runtimeConfig.logoutAddress = runtimeConfig.apiAddress + "/auth/logout";
}
if (runtimeConfig.tokenRefreshAddress) {
    const authUrl = url.parse(runtimeConfig.tokenRefreshAddress);
    runtimeConfig.authPath = (_b = authUrl.pathname) !== null && _b !== void 0 ? _b : "";
}
runtimeConfig.baseFolderTemplate = serverConfig.baseFolderTemplate;
//# sourceMappingURL=config.js.map