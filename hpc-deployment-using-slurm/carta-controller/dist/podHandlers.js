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
const express_1 = __importDefault(require("express"));
const url = __importStar(require("url"));
const querystring = __importStar(require("querystring"));
const uuid_1 = require("uuid");
const util_1 = require("./util");
const auth_1 = require("./auth");
const child_process_1 = require("child_process");
const process_1 = require("process");
const client_node_1 = require("@kubernetes/client-node");
const kubNamespace = process_1.env.K8S_NAMESPACE ? process_1.env.K8S_NAMESPACE : "default";
const kubBackendImg = process_1.env.K8S_BACKEND_IMG ? process_1.env.K8S_BACKEND_IMG : "quay.io/aikema/carta_k8s_backend";
const kubImagesPvc = process_1.env.K8S_IMAGES_PVC ? process_1.env.K8S_IMAGES_PVC : "cephfs-images-pvc";
if (process_1.env.K8S_NAMESPACE) {
    util_1.logger.info(`Read k8s namespace "${kubNamespace}" from environment`);
}
if (process_1.env.K8S_BACKEND_IMG) {
    util_1.logger.info(`Read k8s backend image "${kubBackendImg}" from environment`);
}
if (process_1.env.K8S_IMAGES_PVC) {
    util_1.logger.info(`Read k8s image PVC "${kubImagesPvc}" from environment`);
}
const kc = new client_node_1.KubeConfig();
kc.loadFromCluster();
const k8sApi = kc.makeApiClient(client_node_1.CoreV1Api);
function getUserIdInfo(username) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)("/usr/bin/id", [username], (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }
            else {
                const output = stdout.trim();
                const uid_output = output === null || output === void 0 ? void 0 : output.match(/uid=(\d+)/);
                const gid_output = output === null || output === void 0 ? void 0 : output.match(/gid=(\d+)/);
                const groups_output = output.match(/groups=(.*)/);
                if (Array.isArray(uid_output) && uid_output[1] !== undefined && Array.isArray(gid_output) && gid_output[1] !== undefined && Array.isArray(groups_output) && groups_output[1] !== undefined) {
                    const uid = parseInt(uid_output[1]);
                    const gid = parseInt(gid_output[1]);
                    const groups = groups_output[1].split(",").map(group => parseInt(group.split("(")[0]));
                    if (isNaN(uid) || isNaN(gid) || groups.map(x => isNaN(x)).includes(true)) {
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
function handleCheckServer(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!req.username) {
            res.status(403).json({ success: false, message: "Invalid username" });
            return;
        }
        try {
            const pod = yield k8sApi.readNamespacedPod({ name: `carta-backend-${req.username}`, namespace: kubNamespace });
            const containerStatuses = (_a = pod === null || pod === void 0 ? void 0 : pod.status) === null || _a === void 0 ? void 0 : _a.containerStatuses;
            res.json({
                success: true,
                running: containerStatuses && !((_b = containerStatuses[0].state) === null || _b === void 0 ? void 0 : _b.running)
            });
        }
        catch (e) {
            res.json({
                success: false,
                running: undefined
            });
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
            // Pull this from container logs
            const podName = `carta-backend-${req.username}`;
            const podLog = yield k8sApi.readNamespacedPodLog({ name: podName, namespace: kubNamespace });
            res.json({
                success: true,
                log: podLog
            });
            return;
        }
        catch (error) {
            util_1.logger.error(error);
            res.json({ success: false });
            return;
        }
    });
}
function handleStartServer(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            res.status(403).json({ success: false, message: "Invalid username" });
            return;
        }
        util_1.logger.warning("handleStartServer never actually gets executed");
        throw { statusCode: 501, message: "Not implemented as never in practice gets called" };
        /*
        startServer(req.username);
        return res.json({success: true, existing: true});
        */
    });
}
function startServer(username) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        let userInfo;
        try {
            userInfo = yield getUserIdInfo(username);
        }
        catch (err) {
            util_1.logger.error(`User ${username} info could not be found`);
            return;
        }
        if (!userInfo) {
            util_1.logger.error(`User ${username} info could not be found`);
            return;
        }
        const manifest = {
            metadata: {
                name: `carta-backend-${username}`
            },
            spec: {
                volumes: [
                    { name: "images-volume", persistentVolumeClaim: { claimName: kubImagesPvc } },
                    { name: "backend-config", configMap: { name: "carta-backend-config" } },
                    { name: "nss-extrausers", configMap: { name: "carta-extrausers" } }
                ],
                restartPolicy: "Never",
                securityContext: {
                    runAsUser: userInfo.uid,
                    runAsGroup: userInfo.gid,
                    supplementalGroups: userInfo.groups
                },
                containers: [
                    {
                        name: `carta-backend-${username}`,
                        image: kubBackendImg,
                        imagePullPolicy: "Always",
                        args: ["--top_level_folder", "/images", ` /images/${username} `],
                        ports: [{ containerPort: 3002 }],
                        volumeMounts: [
                            {
                                mountPath: "/images",
                                name: "images-volume"
                            },
                            {
                                mountPath: "/config",
                                readOnly: true,
                                name: "backend-config"
                            },
                            {
                                mountPath: "/var/lib/extrausers",
                                readOnly: true,
                                name: "nss-extrausers"
                            }
                        ],
                        env: [
                            {
                                name: "CARTA_AUTH_TOKEN",
                                value: (0, uuid_1.v4)()
                            }
                        ],
                        securityContext: {
                            allowPrivilegeEscalation: false
                        }
                    }
                ]
            }
        };
        k8sApi.createNamespacedPod({ namespace: kubNamespace, body: manifest }).then(response => {
            var _a;
            util_1.logger.info(`Pod created:\t${(_a = response === null || response === void 0 ? void 0 : response.metadata) === null || _a === void 0 ? void 0 : _a.name}`);
        }, err => {
            util_1.logger.error("Error:", err);
        });
        for (let i = 0; i < 100; i++) {
            try {
                const res = yield k8sApi.readNamespacedPod({ name: `carta-backend-${username}`, namespace: kubNamespace });
                const containerStatuses = (_a = res === null || res === void 0 ? void 0 : res.status) === null || _a === void 0 ? void 0 : _a.containerStatuses;
                if (!containerStatuses || !((_b = containerStatuses[0].state) === null || _b === void 0 ? void 0 : _b.running)) {
                    util_1.logger.debug(`Pod not running for ${username}`);
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                }
                else {
                    util_1.logger.debug(`Pod running for ${username}`);
                    break;
                }
            }
            catch (err) {
                if (err.response && err.response.body && err.response.body.code === 404) {
                    util_1.logger.debug(`Pod not running for ${username}`);
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                }
                else {
                    util_1.logger.error(err);
                }
            }
        }
    });
}
function handleStopServer(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.username) {
            return next({ statusCode: 403, message: "Invalid username" });
        }
        try {
            const podName = `carta-backend-${req.username}`;
            const gracePeriodSeconds = 2;
            yield k8sApi.deleteNamespacedPod({ name: podName, namespace: kubNamespace, gracePeriodSeconds });
            util_1.logger.info("Pod deleted:", podName);
        }
        catch (error) {
            util_1.logger.error("Error: ", error);
        }
        res.json({ success: true });
        return;
    });
}
const createUpgradeHandler = (server) => (req, socket, head) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        if (!(req === null || req === void 0 ? void 0 : req.url)) {
            return socket.end();
        }
        let parsedUrl = url.parse(req.url);
        if (!(parsedUrl === null || parsedUrl === void 0 ? void 0 : parsedUrl.query)) {
            console.log(`Incoming Websocket upgrade request could not be parsed: ${req.url}`);
            return socket.end();
        }
        let queryParameters = querystring.parse(parsedUrl.query);
        const tokenString = queryParameters === null || queryParameters === void 0 ? void 0 : queryParameters.token;
        if (!tokenString || Array.isArray(tokenString)) {
            util_1.logger.warning(`Incoming Websocket upgrade request is missing an authentication token`);
            return socket.end();
        }
        const token = yield (0, auth_1.verifyToken)(tokenString);
        if (!token || !token.username) {
            util_1.logger.warning(`Incoming Websocket upgrade request has an invalid token`);
            return socket.end();
        }
        const remoteAddress = ((_a = req.headers) === null || _a === void 0 ? void 0 : _a["x-forwarded-for"]) || ((_b = req.connection) === null || _b === void 0 ? void 0 : _b.remoteAddress);
        util_1.logger.info(`WS upgrade request from ${remoteAddress} for authenticated user ${token.username}`);
        const username = (0, auth_1.getUser)(token.username, token.iss);
        if (!username) {
            util_1.logger.warning(`Could not find username ${token.username} in the user map`);
            return socket.end();
        }
        // Look up pod info and create if necessary
        const podName = `carta-backend-${username}`;
        try {
            const res = yield k8sApi.readNamespacedPod({ name: podName, namespace: kubNamespace });
            const containerStatuses = (_c = res === null || res === void 0 ? void 0 : res.status) === null || _c === void 0 ? void 0 : _c.containerStatuses;
            if (containerStatuses && ((_d = containerStatuses[0].state) === null || _d === void 0 ? void 0 : _d.terminated)) {
                util_1.logger.debug(`Found stopped backend for ${username} ... need to remove it and start a new one`);
                yield k8sApi.deleteNamespacedPod({ name: podName, namespace: kubNamespace });
                let podExists = true;
                while (podExists) {
                    try {
                        yield k8sApi.readNamespacedPod({ name: podName, namespace: kubNamespace });
                        yield new Promise(resolve => setTimeout(resolve, 500));
                    }
                    catch (err) {
                        if (err.response.statusCode === 404) {
                            podExists = false;
                        }
                        else {
                            throw err;
                        }
                    }
                }
                yield startServer(username);
            }
            if (!containerStatuses || !((_e = containerStatuses[0].state) === null || _e === void 0 ? void 0 : _e.running)) {
                util_1.logger.debug(`Server not running for ${username}... assume it's still starting`);
                yield new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        catch (err) {
            if (err.response && err.response.body && err.response.body.code === 404) {
                util_1.logger.debug(`No pod found for ${username}`);
                yield startServer(username);
            }
            else {
                util_1.logger.error(err);
                return socket.end();
            }
        }
        // Look up auth token
        const pod = yield k8sApi.readNamespacedPod({ name: `carta-backend-${username}`, namespace: kubNamespace });
        const podIp = `${(_f = pod.status) === null || _f === void 0 ? void 0 : _f.podIP}`;
        const cartaAuthToken = (_j = (_h = (_g = pod === null || pod === void 0 ? void 0 : pod.spec) === null || _g === void 0 ? void 0 : _g.containers[0]) === null || _h === void 0 ? void 0 : _h.env) === null || _j === void 0 ? void 0 : _j.find(env => env.name === "CARTA_AUTH_TOKEN");
        if (cartaAuthToken === undefined) {
            throw new Error(`Auth token missing for ${username}`);
        }
        req.headers["carta-auth-token"] = cartaAuthToken === null || cartaAuthToken === void 0 ? void 0 : cartaAuthToken.value; //cartaAuthToken?.value;
        req.url = "/";
        return server.ws(req, socket, head, { target: { host: podIp, port: 3002 } });
    }
    catch (err) {
        util_1.logger.error(`Error upgrading socket`);
        util_1.logger.error(err);
        return socket.end();
    }
});
exports.createUpgradeHandler = createUpgradeHandler;
const createScriptingProxyHandler = (server) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    util_1.logger.warning("createScriptingProxyHandler not implemented as neither Google nor OIDC auth methods compatible");
    throw { statusCode: 501, message: "createScriptingProxyHandler not implemented as neither Google nor OIDC auth methods compatible" };
});
exports.createScriptingProxyHandler = createScriptingProxyHandler;
exports.serverRouter = express_1.default.Router();
exports.serverRouter.post("/start", auth_1.authGuard, util_1.noCache, handleStartServer); // in practice not used
exports.serverRouter.post("/stop", auth_1.authGuard, util_1.noCache, handleStopServer);
exports.serverRouter.get("/status", auth_1.authGuard, util_1.noCache, handleCheckServer);
exports.serverRouter.get("/log", auth_1.authGuard, util_1.noCache, handleLog);
//# sourceMappingURL=podHandlers.js.map