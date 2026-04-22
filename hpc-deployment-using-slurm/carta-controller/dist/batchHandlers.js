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
exports.serverRouter = exports.createScriptingProxyHandler = exports.createUpgradeHandler = void 0;
exports.getUserIdInfo = getUserIdInfo;
exports.startFrontendSessionReaper = startFrontendSessionReaper;
const child_process_1 = require("child_process");
const express_1 = __importDefault(require("express"));
const fs = __importStar(require("fs"));
const net_1 = __importDefault(require("net"));
const process_1 = require("process");
const querystring = __importStar(require("querystring"));
const url = __importStar(require("url"));
const util_1 = require("util");
const uuid_1 = require("uuid");
const auth_1 = require("./auth");
const backendLaunch_1 = require("./backendLaunch");
const config_1 = require("./config");
const database_1 = require("./database");
const util_2 = require("./util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_JOB_TIMEOUT_MS = 120000;
const DEFAULT_JOB_NAME_PREFIX = "carta-backend";
const DEFAULT_FRONTEND_HEARTBEAT_TTL_MS = 120000;
const FRONTEND_REAPER_INTERVAL_MS = 15000;
const FRONTEND_WEBSOCKET_DISCONNECT_GRACE_MS = 5000;
let frontendSessionReaperHandle;
let frontendSessionReaperRunning = false;
const frontendWebsocketCounts = new Map();
const frontendWebsocketCancelTimers = new Map();
function shellEscape(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function getExecCommandStreams(error) {
    var _a, _b, _c, _d;
    const commandError = error;
    return {
        stdout: (_b = (_a = commandError.stdout) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
        stderr: (_d = (_c = commandError.stderr) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
    };
}
function replaceUsernameTemplate(template, username) {
    return template.split("{username}").join(username);
}
function normalizeOptionalSlurmValue(value) {
    const trimmedValue = value === null || value === void 0 ? void 0 : value.trim();
    return trimmedValue ? trimmedValue : undefined;
}
function isPortOpen(host, port, timeoutMs) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield new Promise(resolve => {
            const socket = new net_1.default.Socket();
            let settled = false;
            const finish = (result) => {
                if (!settled) {
                    settled = true;
                    socket.destroy();
                    resolve(result);
                }
            };
            socket.setTimeout(timeoutMs);
            socket.once("connect", () => finish(true));
            socket.once("timeout", () => finish(false));
            socket.once("error", () => finish(false));
            socket.connect(port, host);
        });
    });
}
function getSlurmConfig() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
    const configured = (_a = config_1.ServerConfig.slurm) !== null && _a !== void 0 ? _a : {};
    const backendImage = (_b = configured.backendImage) !== null && _b !== void 0 ? _b : process_1.env.CARTA_BACKEND_IMAGE;
    const imagesDir = (_c = configured.imagesDir) !== null && _c !== void 0 ? _c : process_1.env.CARTA_IMAGES_DIR;
    const logDir = (_d = configured.logDir) !== null && _d !== void 0 ? _d : process_1.env.CARTA_LOG_DIR;
    if (!backendImage) {
        throw new Error("Missing Slurm backend image. Set slurm.backendImage or CARTA_BACKEND_IMAGE.");
    }
    if (!imagesDir) {
        throw new Error("Missing Slurm images directory. Set slurm.imagesDir or CARTA_IMAGES_DIR.");
    }
    if (!logDir) {
        throw new Error("Missing Slurm log directory. Set slurm.logDir or CARTA_LOG_DIR.");
    }
    return Object.assign(Object.assign({}, configured), { jobNamePrefix: (_e = configured.jobNamePrefix) !== null && _e !== void 0 ? _e : DEFAULT_JOB_NAME_PREFIX, backendImage,
        imagesDir,
        logDir, partition: normalizeOptionalSlurmValue((_f = configured.partition) !== null && _f !== void 0 ? _f : process_1.env.SLURM_PARTITION), account: normalizeOptionalSlurmValue((_g = configured.account) !== null && _g !== void 0 ? _g : process_1.env.SLURM_ACCOUNT), configDir: (_h = configured.configDir) !== null && _h !== void 0 ? _h : process_1.env.CARTA_CONFIG_DIR, extraUsersDir: (_j = configured.extraUsersDir) !== null && _j !== void 0 ? _j : process_1.env.CARTA_EXTRAUSERS_DIR, scriptDir: (_k = configured.scriptDir) !== null && _k !== void 0 ? _k : "/tmp/carta-controller-slurm", sbatchCommand: (_m = (_l = configured.sbatchCommand) !== null && _l !== void 0 ? _l : process_1.env.SBATCH_COMMAND) !== null && _m !== void 0 ? _m : "/usr/bin/sbatch", squeueCommand: (_p = (_o = configured.squeueCommand) !== null && _o !== void 0 ? _o : process_1.env.SQUEUE_COMMAND) !== null && _p !== void 0 ? _p : "/usr/bin/squeue", scancelCommand: (_r = (_q = configured.scancelCommand) !== null && _q !== void 0 ? _q : process_1.env.SCANCEL_COMMAND) !== null && _r !== void 0 ? _r : "/usr/bin/scancel", sacctCommand: (_t = (_s = configured.sacctCommand) !== null && _s !== void 0 ? _s : process_1.env.SACCT_COMMAND) !== null && _t !== void 0 ? _t : "/usr/bin/sacct", apptainerCommand: (_v = (_u = configured.apptainerCommand) !== null && _u !== void 0 ? _u : process_1.env.APPTAINER_COMMAND) !== null && _v !== void 0 ? _v : "apptainer", pollIntervalMs: (_w = configured.pollIntervalMs) !== null && _w !== void 0 ? _w : DEFAULT_POLL_INTERVAL_MS, jobStartupTimeoutMs: (_x = configured.jobStartupTimeoutMs) !== null && _x !== void 0 ? _x : DEFAULT_JOB_TIMEOUT_MS, timeLimit: (_y = configured.timeLimit) !== null && _y !== void 0 ? _y : "04:00:00", memory: (_z = configured.memory) !== null && _z !== void 0 ? _z : "1G", cpusPerTask: (_0 = configured.cpusPerTask) !== null && _0 !== void 0 ? _0 : 1, tasks: (_1 = configured.tasks) !== null && _1 !== void 0 ? _1 : 1, nodes: (_2 = configured.nodes) !== null && _2 !== void 0 ? _2 : 1, backendConfigHostTemplate: (_3 = configured.backendConfigHostTemplate) !== null && _3 !== void 0 ? _3 : "/tmp/carta-{username}-backend.json", additionalSbatchArgs: (_4 = configured.additionalSbatchArgs) !== null && _4 !== void 0 ? _4 : [] });
}
function execCommand(command_1, args_1) {
    return __awaiter(this, arguments, void 0, function* (command, args, allowNonZero = false) {
        var _a, _b, _c, _d;
        try {
            const result = yield execFileAsync(command, args);
            return {
                stdout: (_b = (_a = result.stdout) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
                stderr: (_d = (_c = result.stderr) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            };
        }
        catch (error) {
            const { stdout, stderr } = getExecCommandStreams(error);
            if (allowNonZero) {
                return { stdout, stderr };
            }
            throw new Error(`Command failed: ${command} ${args.join(" ")}\n${stderr || stdout || getErrorMessage(error)}`);
        }
    });
}
function execCommandAsUser(username_1, command_1, args_1) {
    return __awaiter(this, arguments, void 0, function* (username, command, args, allowNonZero = false) {
        return execCommand("sudo", ["-n", "-u", username, "--", command, ...args], allowNonZero);
    });
}
function getUserIdInfo(username) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)("/usr/bin/id", [username], (error, stdout) => {
            if (error) {
                reject(error);
            }
            else {
                const output = stdout.trim();
                const uidOutput = output.match(/uid=(\d+)/);
                const gidOutput = output.match(/gid=(\d+)/);
                const groupsOutput = output.match(/groups=(.*)/);
                if (Array.isArray(uidOutput) && uidOutput[1] !== undefined && Array.isArray(gidOutput) && gidOutput[1] !== undefined && Array.isArray(groupsOutput) && groupsOutput[1] !== undefined) {
                    const uid = Number.parseInt(uidOutput[1]);
                    const gid = Number.parseInt(gidOutput[1]);
                    const groups = groupsOutput[1].split(",").map((group) => Number.parseInt(group.split("(")[0]));
                    if (Number.isNaN(uid) || Number.isNaN(gid) || groups.some(group => Number.isNaN(group))) {
                        reject(new Error("Invalid id info"));
                    }
                    else {
                        resolve({ uid, gid, groups });
                    }
                }
                else {
                    reject(new Error("Invalid id info"));
                }
            }
        });
    });
}
function buildJobName(username) {
    return `${getSlurmConfig().jobNamePrefix}-${username}`;
}
function parseSqueueOutput(stdout) {
    const line = stdout
        .split("\n")
        .map((entry) => entry.trim())
        .find(Boolean);
    if (!line) {
        return undefined;
    }
    const [jobId, state, node] = line.split("|");
    if (!jobId || !state) {
        return undefined;
    }
    const normalizedNode = node && node !== "n/a" && node !== "(null)" ? node : undefined;
    return { jobId, state, node: normalizedNode };
}
function isTerminalState(state) {
    return state ? ["CANCELLED", "COMPLETED", "FAILED", "TIMEOUT", "BOOT_FAIL", "DEADLINE", "NODE_FAIL", "OUT_OF_MEMORY", "PREEMPTED"].includes(state) : false;
}
function isRunnableState(state) {
    return state ? ["PENDING", "CONFIGURING", "RUNNING", "COMPLETING"].includes(state) : false;
}
function getFrontendHeartbeatTtlMs() {
    return DEFAULT_FRONTEND_HEARTBEAT_TTL_MS;
}
function getActiveJobByName(username) {
    return __awaiter(this, void 0, void 0, function* () {
        const slurm = getSlurmConfig();
        const jobName = buildJobName(username);
        const { stdout } = yield execCommandAsUser(username, slurm.squeueCommand, ["--name", jobName, "--noheader", "--format=%i|%T|%N"], true);
        return parseSqueueOutput(stdout);
    });
}
function getJobById(username, jobId) {
    return __awaiter(this, void 0, void 0, function* () {
        const slurm = getSlurmConfig();
        const { stdout } = yield execCommandAsUser(username, slurm.squeueCommand, ["-j", jobId, "--noheader", "--format=%i|%T|%N"], true);
        return parseSqueueOutput(stdout);
    });
}
function getHistoricalJobState(username, jobId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const slurm = getSlurmConfig();
        const { stdout } = yield execCommandAsUser(username, slurm.sacctCommand, ["-j", jobId, "--noheader", "--parsable2", "--format=JobIDRaw,State,ExitCode,Reason"], true);
        const match = stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.split("|"))
            .find((parts) => parts[0] === jobId && parts[1]);
        if (!(match === null || match === void 0 ? void 0 : match[1])) {
            return undefined;
        }
        return {
            state: match[1].split(" ")[0],
            exitCode: ((_a = match[2]) === null || _a === void 0 ? void 0 : _a.trim()) || undefined,
            reason: ((_b = match[3]) === null || _b === void 0 ? void 0 : _b.trim()) || undefined
        };
    });
}
function formatHistoricalJobFailure(jobId, historicalJob) {
    const details = [historicalJob.exitCode ? `exit code ${historicalJob.exitCode}` : undefined, historicalJob.reason && historicalJob.reason !== "None" ? `reason ${historicalJob.reason}` : undefined].filter(Boolean).join(", ");
    return details ? `Slurm job ${jobId} ended in state ${historicalJob.state} (${details})` : `Slurm job ${jobId} ended in state ${historicalJob.state}`;
}
function readSessionLogTail(session_1) {
    return __awaiter(this, arguments, void 0, function* (session, maxLines = 20) {
        if (!session.logFile || !fs.existsSync(session.logFile)) {
            return undefined;
        }
        const logContents = yield fs.promises.readFile(session.logFile, "utf8");
        const tail = logContents.trim().split("\n").slice(-maxLines).join("\n").trim();
        return tail || undefined;
    });
}
function buildSessionFailureMessage(session, baseMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        const logTail = yield readSessionLogTail(session);
        return logTail ? `${baseMessage}\nSlurm log tail:\n${logTail}` : baseMessage;
    });
}
function refreshSession(username) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const session = yield (0, database_1.getBackendSession)(username);
        if (!session) {
            return undefined;
        }
        const activeJob = yield getJobById(username, session.jobId);
        if (activeJob) {
            const refreshedSession = Object.assign(Object.assign({}, session), { state: activeJob.state, node: (_a = activeJob.node) !== null && _a !== void 0 ? _a : session.node, updatedAt: new Date() });
            yield (0, database_1.upsertBackendSession)(refreshedSession);
            return refreshedSession;
        }
        const historicalJob = yield getHistoricalJobState(username, session.jobId);
        if (historicalJob) {
            const refreshedSession = Object.assign(Object.assign({}, session), { state: historicalJob.state, updatedAt: new Date() });
            yield (0, database_1.upsertBackendSession)(refreshedSession);
            return refreshedSession;
        }
        const refreshedSession = Object.assign(Object.assign({}, session), { state: "UNKNOWN", updatedAt: new Date() });
        yield (0, database_1.upsertBackendSession)(refreshedSession);
        return refreshedSession;
    });
}
function releaseStalePortHolds() {
    return __awaiter(this, void 0, void 0, function* () {
        const sessions = yield (0, database_1.listBackendSessions)();
        for (const session of sessions) {
            if (isTerminalState(session.state)) {
                continue;
            }
            const liveJob = yield getJobById(session.username, session.jobId);
            if (!liveJob) {
                yield (0, database_1.upsertBackendSession)(Object.assign(Object.assign({}, session), { state: "UNKNOWN", updatedAt: new Date() }));
            }
        }
    });
}
function allocatePort(username) {
    return __awaiter(this, void 0, void 0, function* () {
        yield releaseStalePortHolds();
        const sessions = yield (0, database_1.listBackendSessions)();
        const usedPorts = new Set();
        for (const session of sessions) {
            if (session.username === username) {
                continue;
            }
            if (session.port >= config_1.ServerConfig.backendPorts.min && session.port <= config_1.ServerConfig.backendPorts.max && !isTerminalState(session.state) && session.state !== "UNKNOWN") {
                usedPorts.add(session.port);
            }
        }
        for (let port = config_1.ServerConfig.backendPorts.min; port <= config_1.ServerConfig.backendPorts.max; port++) {
            if (!usedPorts.has(port)) {
                return port;
            }
        }
        throw new Error("No free backend ports available");
    });
}
function buildBatchScript(username, port, authToken, logFile) {
    const slurm = getSlurmConfig();
    const jobName = buildJobName(username);
    const { topLevelFolder, baseFolder } = (0, util_2.getUserFolders)(config_1.ServerConfig.rootFolderTemplate, config_1.ServerConfig.baseFolderTemplate, username);
    const backendConfigHost = replaceUsernameTemplate(slurm.backendConfigHostTemplate, username);
    const bindMounts = [`${slurm.imagesDir}:${slurm.imagesDir}`, `${backendConfigHost}:/etc/carta/backend.json`];
    const skippedBindSources = [];
    if (slurm.configDir) {
        if (fs.existsSync(slurm.configDir)) {
            bindMounts.push(`${slurm.configDir}:${slurm.configDir}`);
        }
        else {
            skippedBindSources.push(slurm.configDir);
        }
    }
    if (slurm.extraUsersDir) {
        if (fs.existsSync(slurm.extraUsersDir)) {
            bindMounts.push(`${slurm.extraUsersDir}:${slurm.extraUsersDir}`);
        }
        else {
            skippedBindSources.push(slurm.extraUsersDir);
        }
    }
    const backendArgs = (0, backendLaunch_1.buildBackendArgv)({
        port,
        topLevelFolder,
        baseFolder,
        additionalArgs: config_1.ServerConfig.additionalArgs,
        disableLog: Boolean(config_1.ServerConfig.backendLogFileTemplate),
        disableHttp: true
    }).map(shellEscape);
    const lines = [
        "#!/usr/bin/env bash",
        `#SBATCH --job-name=${jobName}`,
        `#SBATCH --chdir=${baseFolder}`,
        `#SBATCH --nodes=${slurm.nodes}`,
        `#SBATCH --ntasks=${slurm.tasks}`,
        `#SBATCH --cpus-per-task=${slurm.cpusPerTask}`,
        `#SBATCH --mem=${slurm.memory}`,
        `#SBATCH --time=${slurm.timeLimit}`,
        `#SBATCH --output=${logFile}`,
        "set -euo pipefail",
        `export CARTA_AUTH_TOKEN=${shellEscape(authToken)}`,
        `mkdir -p ${shellEscape(slurm.logDir)}`,
        `mkdir -p ${shellEscape(pathDirname(backendConfigHost))}`,
        `if [ ! -f ${shellEscape(backendConfigHost)} ]; then echo '{}' > ${shellEscape(backendConfigHost)}; fi`,
        `if [ -O ${shellEscape(backendConfigHost)} ]; then chmod 600 ${shellEscape(backendConfigHost)} || true; fi`,
        `if [ ! -d ${shellEscape(baseFolder)} ]; then echo "ERROR: missing user directory ${baseFolder}" >&2; exit 1; fi`,
        `cd ${shellEscape(baseFolder)}`,
        ...skippedBindSources.map((source) => `echo "WARNING: skipping optional bind source ${source} because it does not exist on the host" >&2`),
        ...buildContainerRuntimeLines(slurm.apptainerCommand),
        "BIND_ARGS=()",
        ...bindMounts.map((bind) => `BIND_ARGS+=(--bind ${shellEscape(bind)})`),
        ...buildBackendCommandLines(config_1.ServerConfig.processCommand, slurm.backendImage),
        `exec "$CONTAINER_RUNTIME" exec "\${BIND_ARGS[@]}" ${shellEscape(slurm.backendImage)} "$BACKEND_COMMAND" ${backendArgs.join(" ")}`
    ];
    if (slurm.partition) {
        lines.splice(7, 0, `#SBATCH --partition=${slurm.partition}`);
    }
    if (slurm.account) {
        lines.splice(7, 0, `#SBATCH --account=${slurm.account}`);
    }
    if (slurm.additionalSbatchArgs.length) {
        for (const arg of slurm.additionalSbatchArgs) {
            lines.splice(lines.findIndex(line => line === "set -euo pipefail"), 0, `#SBATCH ${arg}`);
        }
    }
    return `${lines.join("\n")}\n`;
}
function buildBackendCommandLines(processCommand, backendImage) {
    const trimmedCommand = processCommand.trim();
    const baseName = pathBasename(trimmedCommand);
    const candidates = Array.from(new Set([
        trimmedCommand,
        baseName,
        baseName ? `/usr/bin/${baseName}` : undefined,
        baseName ? `/usr/local/bin/${baseName}` : undefined,
        baseName ? `/opt/carta/bin/${baseName}` : undefined,
        baseName ? `/opt/carta-beta/bin/${baseName}` : undefined
    ].filter((candidate) => Boolean(candidate))));
    return [
        "BACKEND_COMMAND=''",
        ...candidates.map((candidate) => `if [ -z "$BACKEND_COMMAND" ] && "$CONTAINER_RUNTIME" exec "\${BIND_ARGS[@]}" ${shellEscape(backendImage)} /bin/sh -c 'test -x "$1" || command -v "$1" >/dev/null 2>&1' sh ${shellEscape(candidate)}; then BACKEND_COMMAND=${shellEscape(candidate)}; fi`),
        `if [ -z "$BACKEND_COMMAND" ]; then echo "ERROR: unable to find backend command (${candidates.join(", ")}) in container ${backendImage}" >&2; exit 127; fi`
    ];
}
function buildContainerRuntimeLines(apptainerCommand) {
    const trimmedCommand = apptainerCommand.trim();
    const baseName = pathBasename(trimmedCommand);
    const shouldTrySingularityFallback = baseName === "apptainer";
    return [
        "export PATH=/usr/local/bin:/usr/bin:/bin:${PATH:-}",
        `CONTAINER_RUNTIME=${shellEscape(trimmedCommand)}`,
        `if ! command -v "$CONTAINER_RUNTIME" >/dev/null 2>&1 && [ ! -x "$CONTAINER_RUNTIME" ]; then`,
        ...(shouldTrySingularityFallback
            ? [
                "    if command -v singularity >/dev/null 2>&1; then",
                '        CONTAINER_RUNTIME="$(command -v singularity)"',
                "    elif [ -x /usr/bin/singularity ]; then",
                "        CONTAINER_RUNTIME=/usr/bin/singularity",
                "    elif [ -x /usr/local/bin/singularity ]; then",
                "        CONTAINER_RUNTIME=/usr/local/bin/singularity",
                "    else",
                `        echo "ERROR: unable to find container runtime (${trimmedCommand}, singularity)" >&2; exit 127`,
                "    fi"
            ]
            : [`    echo "ERROR: unable to find container runtime (${trimmedCommand})" >&2; exit 127`]),
        "fi"
    ];
}
function pathDirname(filePath) {
    const lastSlash = filePath.lastIndexOf("/");
    return lastSlash >= 0 ? filePath.slice(0, lastSlash) || "/" : ".";
}
function pathBasename(filePath) {
    const lastSlash = filePath.lastIndexOf("/");
    return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
}
function submitBackendJob(username) {
    return __awaiter(this, void 0, void 0, function* () {
        const slurm = getSlurmConfig();
        yield getUserIdInfo(username);
        const port = yield allocatePort(username);
        const authToken = (0, uuid_1.v4)();
        const jobName = buildJobName(username);
        const scriptDir = slurm.scriptDir;
        fs.mkdirSync(scriptDir, { recursive: true });
        const scriptPath = `${scriptDir}/${jobName}-${Date.now()}.sbatch`;
        const logFileTemplate = `${slurm.logDir}/${jobName}-%j.log`;
        fs.writeFileSync(scriptPath, buildBatchScript(username, port, authToken, logFileTemplate), { mode: 0o644 });
        try {
            const { stdout } = yield execCommandAsUser(username, slurm.sbatchCommand, ["--parsable", scriptPath]);
            const jobId = stdout.trim().split(";")[0];
            if (!jobId) {
                throw new Error("sbatch did not return a job id");
            }
	            const session = {
	                username,
	                jobName,
	                jobId,
	                port,
	                authToken,
	                logFile: logFileTemplate.replace("%j", jobId),
	                state: "PENDING",
	                frontendSessionId: null,
	                frontendLeaseExpiresAt: null,
	                createdAt: new Date(),
	                updatedAt: new Date()
	            };
            yield (0, database_1.upsertBackendSession)(session);
            return session;
        }
        finally {
            fs.unlink(scriptPath, () => undefined);
        }
    });
}
function waitForRunningSession(session) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const slurm = getSlurmConfig();
        const deadline = Date.now() + slurm.jobStartupTimeoutMs;
        let current = session;
        const portCheckTimeoutMs = Math.min(slurm.pollIntervalMs, 1000);
        while (Date.now() < deadline) {
            const activeJob = yield getJobById(current.username, current.jobId);
            if (activeJob) {
                current = Object.assign(Object.assign({}, current), { state: activeJob.state, node: (_a = activeJob.node) !== null && _a !== void 0 ? _a : current.node, updatedAt: new Date() });
                yield (0, database_1.upsertBackendSession)(current);
                if (activeJob.state === "RUNNING" && activeJob.node) {
                    const backendReady = yield isPortOpen(activeJob.node, current.port, portCheckTimeoutMs);
                    if (backendReady) {
                        return current;
                    }
                }
                if (isTerminalState(activeJob.state)) {
                    throw new Error(yield buildSessionFailureMessage(current, `Slurm job ${current.jobId} ended in state ${activeJob.state}`));
                }
            }
            else {
                const historicalJob = yield getHistoricalJobState(current.username, current.jobId);
                if (historicalJob && isTerminalState(historicalJob.state)) {
                    current = Object.assign(Object.assign({}, current), { state: historicalJob.state, updatedAt: new Date() });
                    yield (0, database_1.upsertBackendSession)(current);
                    throw new Error(yield buildSessionFailureMessage(current, formatHistoricalJobFailure(current.jobId, historicalJob)));
                }
            }
            yield (0, util_2.delay)(slurm.pollIntervalMs);
        }
        throw new Error(`Timed out waiting for Slurm job ${session.jobId} to start`);
    });
}
function ensureServerSession(username) {
    return __awaiter(this, void 0, void 0, function* () {
        const existingSession = yield refreshSession(username);
        if (existingSession) {
            if (existingSession.state === "RUNNING" && existingSession.node) {
                return existingSession;
            }
            if (isRunnableState(existingSession.state)) {
                return waitForRunningSession(existingSession);
            }
        }
        const activeJob = yield getActiveJobByName(username);
        if (activeJob) {
            util_2.logger.warning(`Found active Slurm job ${activeJob.jobId} for ${username} without usable controller metadata, cancelling it before resubmitting`);
            yield execCommandAsUser(username, getSlurmConfig().scancelCommand, [activeJob.jobId], true);
            yield (0, util_2.delay)(getSlurmConfig().pollIntervalMs);
        }
        const newSession = yield submitBackendJob(username);
        return waitForRunningSession(newSession);
    });
}
function cancelBackendSession(username, session) {
    return __awaiter(this, void 0, void 0, function* () {
        const activeSession = session !== null && session !== void 0 ? session : (yield refreshSession(username));
        if (activeSession && !isTerminalState(activeSession.state)) {
            yield execCommandAsUser(username, getSlurmConfig().scancelCommand, [activeSession.jobId], true);
            yield (0, database_1.upsertBackendSession)(Object.assign(Object.assign({}, activeSession), { state: "CANCELLED", updatedAt: new Date() }));
            return;
        }
        const activeJob = yield getActiveJobByName(username);
        if (activeJob) {
            yield execCommandAsUser(username, getSlurmConfig().scancelCommand, [activeJob.jobId], true);
        }
        yield (0, database_1.deleteBackendSession)(username);
    });
}
function handleCheckServer(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            res.status(403).json({ success: false, message: "Invalid username" });
            return;
        }
        try {
            const session = yield refreshSession(req.username);
            res.json({
                success: Boolean(session),
                running: (session === null || session === void 0 ? void 0 : session.state) === "RUNNING",
                state: session === null || session === void 0 ? void 0 : session.state,
                node: session === null || session === void 0 ? void 0 : session.node,
                port: session === null || session === void 0 ? void 0 : session.port
            });
        }
        catch (error) {
            util_2.logger.error(error);
            res.json({ success: false, running: false });
        }
    });
}
function handleLog(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            res.status(403).json({ success: false, message: "Invalid username" });
            return;
        }
        try {
            const session = yield refreshSession(req.username);
            if (!(session === null || session === void 0 ? void 0 : session.logFile) || !fs.existsSync(session.logFile)) {
                res.json({ success: false });
                return;
            }
            const log = yield fs.promises.readFile(session.logFile, "utf8");
            res.json({ success: true, log });
        }
        catch (error) {
            util_2.logger.error(error);
            res.json({ success: false });
        }
    });
}
function handleStartServer(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            res.status(403).json({ success: false, message: "Invalid username" });
            return;
        }
        try {
            const existingSession = yield refreshSession(req.username);
            const session = yield ensureServerSession(req.username);
            res.json({
                success: true,
                existing: Boolean(existingSession && isRunnableState(existingSession.state)),
                state: session.state,
                node: session.node,
                port: session.port
            });
        }
        catch (error) {
            util_2.logger.error(error);
            return next({ statusCode: 500, message: getErrorMessage(error) });
        }
    });
}
function handleStopServer(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        try {
            yield cancelBackendSession(req.username);
        }
        catch (error) {
            util_2.logger.error(error);
        }
        res.json({ success: true });
    });
}
function handleFrontendHeartbeat(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        const frontendSessionId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.sessionId;
        if (!frontendSessionId || typeof frontendSessionId !== "string") {
            return next({ statusCode: 400, message: "Missing frontend session id" });
        }
        try {
            const session = yield refreshSession(req.username);
            if (!session || isTerminalState(session.state)) {
                return res.status(409).json({ success: false, message: "No active backend session" });
            }
            const frontendLeaseExpiresAt = new Date(Date.now() + getFrontendHeartbeatTtlMs());
            yield (0, database_1.upsertBackendSession)(Object.assign(Object.assign({}, session), { frontendSessionId,
                frontendLeaseExpiresAt, updatedAt: new Date() }));
            return res.json({ success: true, ttlMs: getFrontendHeartbeatTtlMs() });
        }
        catch (error) {
            util_2.logger.error(error);
            return next({ statusCode: 500, message: getErrorMessage(error) });
        }
    });
}
function reapExpiredFrontendSessions() {
    return __awaiter(this, void 0, void 0, function* () {
        if (frontendSessionReaperRunning) {
            return;
        }
        frontendSessionReaperRunning = true;
        try {
            const sessions = yield (0, database_1.listBackendSessions)();
            const now = Date.now();
            for (const session of sessions) {
                if (isTerminalState(session.state) || !session.frontendLeaseExpiresAt) {
                    continue;
                }
                const leaseExpiresAt = new Date(session.frontendLeaseExpiresAt).getTime();
                if (Number.isNaN(leaseExpiresAt) || leaseExpiresAt > now) {
                    continue;
                }
                util_2.logger.info(`Frontend heartbeat expired for ${session.username}; cancelling Slurm job ${session.jobId}`);
                try {
                    yield cancelBackendSession(session.username, session);
                }
                catch (error) {
                    util_2.logger.error(`Failed to cancel expired frontend session for ${session.username}: ${getErrorMessage(error)}`);
                }
            }
        }
        catch (error) {
            util_2.logger.debug(`Skipping frontend session reap cycle: ${getErrorMessage(error)}`);
        }
        finally {
            frontendSessionReaperRunning = false;
        }
    });
}
function startFrontendSessionReaper() {
    var _a;
    if (frontendSessionReaperHandle) {
        return;
    }
    frontendSessionReaperHandle = setInterval(() => {
        void reapExpiredFrontendSessions();
    }, FRONTEND_REAPER_INTERVAL_MS);
    (_a = frontendSessionReaperHandle.unref) === null || _a === void 0 ? void 0 : _a.call(frontendSessionReaperHandle);
}
function registerFrontendWebsocket(username, session) {
    const existingTimer = frontendWebsocketCancelTimers.get(username);
    if (existingTimer) {
        clearTimeout(existingTimer);
        frontendWebsocketCancelTimers.delete(username);
    }
    frontendWebsocketCounts.set(username, (frontendWebsocketCounts.get(username) || 0) + 1);
    let closed = false;
    return () => {
        if (closed) {
            return;
        }
        closed = true;
        const remainingConnections = Math.max((frontendWebsocketCounts.get(username) || 1) - 1, 0);
        if (remainingConnections > 0) {
            frontendWebsocketCounts.set(username, remainingConnections);
            return;
        }
        frontendWebsocketCounts.delete(username);
        const cancelTimer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            frontendWebsocketCancelTimers.delete(username);
            if ((frontendWebsocketCounts.get(username) || 0) > 0) {
                return;
            }
            util_2.logger.info(`Frontend websocket closed for ${username}; cancelling Slurm job ${session.jobId}`);
            try {
                yield cancelBackendSession(username, session);
            }
            catch (error) {
                util_2.logger.error(`Failed to cancel Slurm job after websocket close for ${username}: ${getErrorMessage(error)}`);
            }
        }), FRONTEND_WEBSOCKET_DISCONNECT_GRACE_MS);
        frontendWebsocketCancelTimers.set(username, cancelTimer);
        if (typeof cancelTimer.unref === "function") {
            cancelTimer.unref();
        }
    };
}
const createUpgradeHandler = (server) => (req, socket, head) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!req.url) {
            return socket.end();
        }
        const parsedUrl = url.parse(req.url);
        if (!parsedUrl.query) {
            util_2.logger.warning(`Incoming websocket upgrade request could not be parsed: ${req.url}`);
            return socket.end();
        }
        const queryParameters = querystring.parse(parsedUrl.query);
        const tokenString = queryParameters.token;
        if (!tokenString || Array.isArray(tokenString)) {
            util_2.logger.warning("Incoming websocket upgrade request is missing an authentication token");
            return socket.end();
        }
        const token = yield (0, auth_1.verifyToken)(tokenString);
        if (!(token === null || token === void 0 ? void 0 : token.username)) {
            util_2.logger.warning("Incoming websocket upgrade request has an invalid token");
            return socket.end();
        }
        const remoteAddress = ((_a = req.headers) === null || _a === void 0 ? void 0 : _a["x-forwarded-for"]) || ((_b = req.connection) === null || _b === void 0 ? void 0 : _b.remoteAddress);
        util_2.logger.info(`WS upgrade request from ${remoteAddress} for authenticated user ${token.username}`);
        const username = (0, auth_1.getUser)(token.username, token.iss);
        if (!username) {
            util_2.logger.warning(`Could not find username ${token.username} in the user map`);
            return socket.end();
        }
        const session = yield ensureServerSession(username);
        if (!session.node) {
            throw new Error(`Missing Slurm node for ${username}`);
        }
        req.headers["carta-auth-token"] = session.authToken;
        req.url = "/";
        const unregisterFrontendWebsocket = registerFrontendWebsocket(username, session);
        socket.once("close", unregisterFrontendWebsocket);
        socket.once("end", unregisterFrontendWebsocket);
        socket.once("error", unregisterFrontendWebsocket);
        return server.ws(req, socket, head, { target: { host: session.node, port: session.port } });
    }
    catch (error) {
        util_2.logger.error("Error upgrading socket");
        if (error instanceof Error) {
            util_2.logger.error(`Error message: ${error.message}`);
            util_2.logger.error(`Stack trace: ${error.stack}`);
        }
        else {
            util_2.logger.error(`Error: ${JSON.stringify(error)}`);
        }
        return socket.end();
    }
});
exports.createUpgradeHandler = createUpgradeHandler;
const createScriptingProxyHandler = (server) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    util_2.logger.warning("createScriptingProxyHandler not implemented for the Slurm controller");
    throw { statusCode: 501, message: "createScriptingProxyHandler not implemented" };
});
exports.createScriptingProxyHandler = createScriptingProxyHandler;
exports.serverRouter = express_1.default.Router();
exports.serverRouter.post("/start", auth_1.authGuard, util_2.noCache, handleStartServer);
exports.serverRouter.post("/stop", auth_1.authGuard, util_2.noCache, handleStopServer);
exports.serverRouter.post("/frontend-heartbeat", auth_1.authGuard, util_2.noCache, handleFrontendHeartbeat);
exports.serverRouter.get("/status", auth_1.authGuard, util_2.noCache, handleCheckServer);
exports.serverRouter.get("/log", auth_1.authGuard, util_2.noCache, handleLog);
//# sourceMappingURL=batchHandlers.js.map
