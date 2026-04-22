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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const bodyParser = __importStar(require("body-parser"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const express_bearer_token_1 = __importDefault(require("express-bearer-token"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const http_proxy_1 = __importDefault(require("http-proxy"));
const path = __importStar(require("path"));
const url = __importStar(require("url"));
const auth_1 = require("./auth");
const config_1 = require("./config");
const controllerTests_1 = require("./controllerTests");
const database_1 = require("./database");
const batchHandlers_1 = require("./batchHandlers");
const util_1 = require("./util");
if (config_1.testUser) {
    (0, controllerTests_1.runTests)(config_1.testUser).then(() => {
        util_1.logger.info(`Controller tests with user ${config_1.testUser} succeeded`);
        process.exit(0);
    }, err => {
        util_1.logger.error(err);
        util_1.logger.info(`Controller tests with user ${config_1.testUser} failed`);
        process.exit(1);
    });
}
else {
    const app = (0, express_1.default)();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use((0, cookie_parser_1.default)());
    app.use((0, express_bearer_token_1.default)());
    app.use((0, cors_1.default)());
    app.use((0, compression_1.default)());
    app.set("view engine", "pug");
    app.set("views", path.join(__dirname, "../views"));
    app.use("/api/auth", bodyParser.json(), auth_1.authRouter);
    app.use("/api/server", bodyParser.json(), batchHandlers_1.serverRouter);
    app.use("/api/database", bodyParser.json(), database_1.databaseRouter);
    app.use("/config", (req, res) => {
        return res.json(config_1.RuntimeConfig);
    });
    // Prevent caching of the frontend HTML code
    const staticHeaderHandler = (res, path) => {
        if (path.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    };
    const frontendRoot = config_1.ServerConfig.frontendPath ? config_1.ServerConfig.frontendPath : path.join(__dirname, "../node_modules/carta-frontend/build");
    if (config_1.ServerConfig.frontendPath) {
        util_1.logger.info(`Serving CARTA frontend from ${config_1.ServerConfig.frontendPath}`);
    }
    else {
        const frontendPackage = require("../node_modules/carta-frontend/package.json");
        const frontendVersion = frontendPackage === null || frontendPackage === void 0 ? void 0 : frontendPackage.version;
        util_1.logger.info(`Serving packaged CARTA frontend (Version ${frontendVersion})`);
    }
    const frontendIndexPath = path.join(frontendRoot, "index.html");
    app.get(["/", "/index.html"], (req, res, next) => {
        try {
            const frontendHtml = fs.readFileSync(frontendIndexPath, "utf8");
            const overlayScriptTag = '<script src="dashboard/frontend-overlay.js"></script>';
            const injectedHtml = frontendHtml.includes(overlayScriptTag) ? frontendHtml : frontendHtml.replace("</body>", `    ${overlayScriptTag}\n</body>`);
            res.setHeader("Cache-Control", "no-cache");
            res.type("html").send(injectedHtml);
        }
        catch (error) {
            util_1.logger.error(`Failed to load frontend index HTML from ${frontendIndexPath}: ${error}`);
            next(error);
        }
    });
    app.use("/", express_1.default.static(frontendRoot, {
        setHeaders: staticHeaderHandler
    }));
    let bannerDataUri;
    if ((_a = config_1.ServerConfig.dashboard) === null || _a === void 0 ? void 0 : _a.bannerImage) {
        const isBannerSvg = config_1.ServerConfig.dashboard.bannerImage.toLowerCase().endsWith(".svg");
        const bannerDataBase64 = fs.readFileSync(config_1.ServerConfig.dashboard.bannerImage, "base64");
        if (isBannerSvg) {
            bannerDataUri = "data:image/svg+xml;base64," + bannerDataBase64;
        }
        else {
            bannerDataUri = "data:image/png;base64," + bannerDataBase64;
        }
    }
    app.get("/frontend", (req, res) => {
        var _a, _b, _c;
        const queryString = (_a = url.parse(req.url, false)) === null || _a === void 0 ? void 0 : _a.query;
        if (queryString) {
            return res.redirect(((_b = config_1.ServerConfig.serverAddress) !== null && _b !== void 0 ? _b : "") + "/?" + queryString);
        }
        else {
            return res.redirect((_c = config_1.ServerConfig.serverAddress) !== null && _c !== void 0 ? _c : "/");
        }
    });
    const packageJson = require(path.join(__dirname, "../package.json"));
    app.get("/dashboard", (req, res) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        res.render("templated", {
            googleClientId: (_a = config_1.ServerConfig.authProviders.google) === null || _a === void 0 ? void 0 : _a.clientId,
            oidcClientId: (_b = config_1.ServerConfig.authProviders.oidc) === null || _b === void 0 ? void 0 : _b.clientId,
            hostedDomain: (_c = config_1.ServerConfig.authProviders.google) === null || _c === void 0 ? void 0 : _c.validDomain,
            googleCallback: `${config_1.ServerConfig.serverAddress}${config_1.RuntimeConfig.apiAddress}/auth/googleCallback`,
            bannerColor: (_d = config_1.ServerConfig.dashboard) === null || _d === void 0 ? void 0 : _d.bannerColor,
            backgroundColor: (_e = config_1.ServerConfig.dashboard) === null || _e === void 0 ? void 0 : _e.backgroundColor,
            bannerImage: bannerDataUri,
            infoText: (_f = config_1.ServerConfig.dashboard) === null || _f === void 0 ? void 0 : _f.infoText,
            loginText: (_g = config_1.ServerConfig.dashboard) === null || _g === void 0 ? void 0 : _g.loginText,
            footerText: (_h = config_1.ServerConfig.dashboard) === null || _h === void 0 ? void 0 : _h.footerText,
            controllerVersion: packageJson.version
        });
    });
    app.use("/dashboard", express_1.default.static(path.join(__dirname, "../public")));
    // Scripting proxy
    const backendProxy = http_proxy_1.default.createServer({ ws: true });
    app.post("/api/scripting/*", auth_1.authGuard, (0, batchHandlers_1.createScriptingProxyHandler)(backendProxy));
    // Simplified error handling
    app.use((err, req, res, next) => {
        err.statusCode = err.statusCode || 500;
        err.status = err.status || "error";
        res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    });
    // Handle WS connections
    const expressServer = http.createServer(app);
    expressServer.on("upgrade", (0, batchHandlers_1.createUpgradeHandler)(backendProxy));
    // Handle WS disconnects
    backendProxy.on("error", (err) => {
        // Ignore connection resets
        if ((err === null || err === void 0 ? void 0 : err.code) === "ECONNRESET") {
            return;
        }
        else {
            util_1.logger.error(`Proxy error:\t${err}`);
        }
    });
    function init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, database_1.initDB)();
            (0, batchHandlers_1.startFrontendSessionReaper)();
            const onListenStart = () => {
                util_1.logger.info(`Started listening for login requests on port ${config_1.ServerConfig.serverPort}`);
            };
            // NodeJS Server constructor supports either a port (and optional interface) OR a path
            if (config_1.ServerConfig.serverInterface && typeof config_1.ServerConfig.serverPort === "number") {
                expressServer.listen(config_1.ServerConfig.serverPort, config_1.ServerConfig.serverInterface, onListenStart);
            }
            else {
                expressServer.listen(config_1.ServerConfig.serverPort, onListenStart);
            }
        });
    }
    init().then(() => { var _a; return util_1.logger.info(`Server initialised successfully at ${(_a = config_1.ServerConfig.serverAddress) !== null && _a !== void 0 ? _a : "localhost"}`); });
}
//# sourceMappingURL=index.js.map
