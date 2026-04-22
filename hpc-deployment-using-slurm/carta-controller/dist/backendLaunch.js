"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBackendArgv = buildBackendArgv;
function buildBackendArgv({ port, topLevelFolder, baseFolder, additionalArgs = [], disableLog = false, disableHttp = false }) {
    const args = ["--no_frontend", "--no_database"];
    if (disableHttp) {
        args.push("--no_http");
    }
    args.push("--port", String(port), "--top_level_folder", topLevelFolder, "--controller_deployment");
    if (disableLog) {
        args.push("--no_log");
    }
    args.push(...additionalArgs, baseFolder);
    return args;
}
//# sourceMappingURL=backendLaunch.js.map