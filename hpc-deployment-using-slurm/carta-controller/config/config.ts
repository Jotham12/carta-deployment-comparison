module.exports = {
    authProviders: {
        dummy: {
            publicKeyLocation: "/etc/carta/carta_public.pem",
            privateKeyLocation: "/etc/carta/carta_private.pem",
            keyAlgorithm: "RS256",
            issuer: "carta.example.com",
            refreshTokenAge: "1w",
            accessTokenAge: "15m"
        }
    },
    secureAuthCookie: false,
    database: {},
    serverPort: 8000,
    backendPorts: {min: 3002, max: 3500},
    processCommand: "/usr/bin/apptainer",
    processCommandArgs: ["run", "/data/carta-backend.sif"],
    rootFolderTemplate: "/data",
    baseFolderTemplate: "/data",
    logFileTemplate: "/data/carta-slurm-logs/{username}_{datetime}_{pid}.log",
    additionalArgs: [],
    killCommand: "/home/ubuntu/carta-controller/scripts/carta_kill_script.sh",
    startDelay: 100
};
