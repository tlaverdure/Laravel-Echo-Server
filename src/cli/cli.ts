const fs = require("fs");
const path = require("path");
const colors = require("colors");
const echo = require("./../../dist");
const inquirer = require("inquirer");
const crypto = require("crypto");

import ErrnoException = NodeJS.ErrnoException;

/**
 * Laravel Echo Server CLI
 */
export class Cli {
    /**
     * Create new CLI instance.
     */
    constructor() {
        this.defaultOptions = echo.defaultOptions;
    }

    /**
     * Default configuration options.
     */
    defaultOptions: any;

    /**
     * Allowed environment variables.
     */
    envVariables: any = {
        LARAVEL_ECHO_SERVER_AUTH_HOST: "authHost",
        LARAVEL_ECHO_SERVER_AUTH_ENDPOINT: "authEndpoint",
        LARAVEL_ECHO_SERVER_DEBUG: "devMode",
        LARAVEL_ECHO_SERVER_HOST: "host",
        LARAVEL_ECHO_SERVER_PORT: "port",
        LARAVEL_ECHO_SERVER_REDIS_HOST: "databaseConfig.redis.host",
        LARAVEL_ECHO_SERVER_REDIS_PORT: "databaseConfig.redis.port",
        LARAVEL_ECHO_SERVER_REDIS_PASSWORD: "databaseConfig.redis.password",
        LARAVEL_ECHO_SERVER_PROTO: "protocol",
        LARAVEL_ECHO_SERVER_SSL_CERT: "sslCertPath",
        LARAVEL_ECHO_SERVER_SSL_KEY: "sslKeyPath",
        LARAVEL_ECHO_SERVER_SSL_CHAIN: "sslCertChainPath",
        LARAVEL_ECHO_SERVER_SSL_PASS: "sslPassphrase"
    };

    /**
     * Create a configuration file.
     */
    configure(yargs: any): void {
        yargs.option({
            config: {
                type: "string",
                default: "laravel-echo-server.json",
                describe: "The name of the config file to create."
            }
        });

        this.setupConfig(yargs.argv.config).then(
            options => {
                options = Object.assign({}, this.defaultOptions, options);

                if (options.addClient) {
                    const client = {
                        appId: this.createAppId(),
                        key: this.createApiKey()
                    };
                    options.clients.push(client);

                    console.log("appId: " + colors.magenta(client.appId));
                    console.log("key: " + colors.magenta(client.key));
                }

                if (options.corsAllow) {
                    options.apiOriginAllow.allowCors = true;
                    options.apiOriginAllow.allowOrigin = options.allowOrigin;
                    options.apiOriginAllow.allowMethods = options.allowMethods;
                    options.apiOriginAllow.allowHeaders = options.allowHeaders;
                }

                this.saveConfig(options).then(
                    file => {
                        console.log(
                            "Configuration file saved. Run " +
                                colors.magenta.bold(
                                    "laravel-echo-server start" +
                                        (file != "laravel-echo-server.json"
                                            ? ' --config="' + file + '"'
                                            : "")
                                ) +
                                " to run server."
                        );

                        process.exit();
                    },
                    error => {
                        console.error(colors.error(error));
                    }
                );
            },
            error => console.error(error)
        );
    }

    /**
     * Inject the .env vars into options if they exist.
     */
    resolveEnvFileOptions(options: any): any {
        require("dotenv").config();

        for (let key in this.envVariables) {
            let value = (process.env[key] || "").toString();
            let replacementVar;

            if (value) {
                const path = this.envVariables[key].split(".");
                let modifier = options;

                while (path.length > 1) {
                    modifier = modifier[path.shift()];
                }

                if ((replacementVar = value.match(/\${(.*?)}/))) {
                    value = (process.env[replacementVar[1]] || "").toString();
                }

                modifier[path.shift()] = value;
            }
        }

        return options;
    }

    /**
     * Setup configuration with questions.
     */
    setupConfig(defaultFile) {
        return inquirer.prompt([
            {
                name: "devMode",
                default: false,
                message: "Do you want to run this server in development mode?",
                type: "confirm"
            },
            {
                name: "port",
                default: "6001",
                message: "Which port would you like to serve from?"
            },
            {
                name: "database",
                message:
                    "Which database would you like to use to store presence channel members?",
                type: "list",
                choices: ["redis", "sqlite"]
            },
            {
                name: "authHost",
                default: "http://localhost",
                message: "Enter the host of your Laravel authentication server."
            },
            {
                name: "protocol",
                message: "Will you be serving on http or https?",
                type: "list",
                choices: ["http", "https"]
            },
            {
                name: "sslCertPath",
                message: "Enter the path to your SSL cert file.",
                when: function(options) {
                    return options.protocol == "https";
                }
            },
            {
                name: "sslKeyPath",
                message: "Enter the path to your SSL key file.",
                when: function(options) {
                    return options.protocol == "https";
                }
            },
            {
                name: "addClient",
                default: false,
                message:
                    "Do you want to generate a client ID/Key for HTTP API?",
                type: "confirm"
            },
            {
                name: "corsAllow",
                default: false,
                message: "Do you want to setup cross domain access to the API?",
                type: "confirm"
            },
            {
                name: "allowOrigin",
                default: "http://localhost:80",
                message: "Specify the URI that may access the API:",
                when: function(options) {
                    return options.corsAllow == true;
                }
            },
            {
                name: "allowMethods",
                default: "GET, POST",
                message: "Enter the HTTP methods that are allowed for CORS:",
                when: function(options) {
                    return options.corsAllow == true;
                }
            },
            {
                name: "allowHeaders",
                default:
                    "Origin, Content-Type, X-Auth-Token, X-Requested-With, Accept, Authorization, X-CSRF-TOKEN, X-Socket-Id",
                message: "Enter the HTTP headers that are allowed for CORS:",
                when: function(options) {
                    return options.corsAllow == true;
                }
            },
            {
                name: "file",
                default: defaultFile,
                message: "What do you want this config to be saved as?"
            }
        ]);
    }

    /**
     * Save configuration file.
     */
    saveConfig(options): Promise<any> {
        const opts = {};

        Object.keys(options)
            .filter(k => {
                return Object.keys(this.defaultOptions).indexOf(k) >= 0;
            })
            .forEach(option => (opts[option] = options[option]));

        return new Promise((resolve, reject) => {
            if (opts) {
                fs.writeFile(
                    this.getConfigFile(options.file),
                    JSON.stringify(opts, null, "\t"),
                    error => (error ? reject(error) : resolve(options.file))
                );
            } else {
                reject("No options provided.");
            }
        });
    }

    /**
     * Start the Laravel Echo server.
     */
    start(yargs: any): void {
        yargs.option({
            config: {
                type: "string",
                describe: "The config file to use."
            },

            dir: {
                type: "string",
                describe: "The working directory to use."
            },

            force: {
                type: "boolean",
                describe: "If a server is already running, stop it."
            },

            dev: {
                type: "boolean",
                describe: "Run in dev mode."
            }
        });

        const configFile = this.getConfigFile(
            yargs.argv.config,
            yargs.argv.dir
        );

        fs.access(configFile, fs.F_OK, error => {
            if (error) {
                console.error(
                    colors.error("Error: The config file could not be found.")
                );

                return false;
            }

            const options = this.readConfigFile(configFile);

            options.devMode =
                `${yargs.argv.dev || options.devMode || false}` === "true";

            const lockFile = path.join(
                path.dirname(configFile),
                path.basename(configFile, ".json") + ".lock"
            );

            if (fs.existsSync(lockFile)) {
                let lockProcess;

                try {
                    lockProcess = parseInt(
                        JSON.parse(fs.readFileSync(lockFile, "utf8")).process
                    );
                } catch {
                    console.error(
                        colors.error(
                            "Error: There was a problem reading the existing lock file."
                        )
                    );
                }

                if (lockProcess) {
                    try {
                        process.kill(lockProcess, 0);

                        if (yargs.argv.force) {
                            process.kill(lockProcess);

                            console.log(
                                colors.yellow(
                                    "Warning: Closing process " +
                                        lockProcess +
                                        " because you used the '--force' option."
                                )
                            );
                        } else {
                            console.error(
                                colors.error(
                                    "Error: There is already a server running! Use the option '--force' to stop it and start another one."
                                )
                            );

                            return false;
                        }
                    } catch {
                        // The process in the lock file doesn't exist, so continue
                    }
                }
            }

            fs.writeFile(
                lockFile,
                JSON.stringify({ process: process.pid }, null, "\t"),
                error => {
                    if (error) {
                        console.error(
                            colors.error("Error: Cannot write lock file.")
                        );

                        return false;
                    }

                    process.on("exit", () => {
                        try {
                            fs.unlinkSync(lockFile);
                        } catch {}
                    });

                    process.on("SIGINT", () => process.exit());
                    process.on("SIGHUP", () => process.exit());
                    process.on("SIGTERM", () => process.exit());

                    echo.run(options);
                }
            );
        });
    }

    /**
     * Stop the Laravel Echo server.
     */
    stop(yargs: any): void {
        yargs.option({
            config: {
                type: "string",
                describe: "The config file to use."
            },

            dir: {
                type: "string",
                describe: "The working directory to use."
            }
        });

        const configFile = this.getConfigFile(
            yargs.argv.config,
            yargs.argv.dir
        );
        const lockFile = path.join(
            path.dirname(configFile),
            path.basename(configFile, ".json") + ".lock"
        );

        if (fs.existsSync(lockFile)) {
            let lockProcess;

            try {
                lockProcess = parseInt(
                    JSON.parse(fs.readFileSync(lockFile, "utf8")).process
                );
            } catch {
                console.error(
                    colors.error(
                        "Error: There was a problem reading the lock file."
                    )
                );
            }

            if (lockProcess) {
                try {
                    fs.unlinkSync(lockFile);

                    process.kill(lockProcess);

                    console.log(colors.green("Closed the running server."));
                } catch (e) {
                    console.error(e);
                    console.log(colors.error("No running servers to close."));
                }
            }
        } else {
            console.log(colors.error("Error: Could not find any lock file."));
        }
    }

    /**
     * Create an app key for server.
     */
    getRandomString(bytes: number): string {
        return crypto.randomBytes(bytes).toString("hex");
    }

    /**
     * Create an api key for the HTTP API.
     */
    createApiKey(): string {
        return this.getRandomString(16);
    }

    /**
     * Create an api key for the HTTP API.
     */
    createAppId(): string {
        return this.getRandomString(8);
    }

    /**
     * Add a registered referrer.
     */
    clientAdd(yargs: any): void {
        yargs.option({
            config: {
                type: "string",
                describe: "The config file to use."
            },

            dir: {
                type: "string",
                describe: "The working directory to use."
            }
        });

        const options = this.readConfigFile(
            this.getConfigFile(yargs.argv.config, yargs.argv.dir)
        );
        const appId = yargs.argv._[1] || this.createAppId();
        options.clients = options.clients || [];

        if (appId) {
            let index = null;
            let client = options.clients.find((client, i) => {
                index = i;
                return client.appId == appId;
            });

            if (client) {
                client.key = this.createApiKey();

                options.clients[index] = client;

                console.log(colors.green("API Client updated!"));
            } else {
                client = {
                    appId: appId,
                    key: this.createApiKey()
                };

                options.clients.push(client);

                console.log(colors.green("API Client added!"));
            }

            console.log(colors.magenta("appId: " + client.appId));
            console.log(colors.magenta("key: " + client.key));

            this.saveConfig(options);
        }
    }

    /**
     * Remove a registered referrer.
     */
    clientRemove(yargs: any): void {
        yargs.option({
            config: {
                type: "string",
                describe: "The config file to use."
            },

            dir: {
                type: "string",
                describe: "The working directory to use."
            }
        });

        const options = this.readConfigFile(
            this.getConfigFile(yargs.argv.config, yargs.argv.dir)
        );
        const appId = yargs.argv._[1] || null;
        options.clients = options.clients || [];

        let index = null;

        const client = options.clients.find((client, i) => {
            index = i;
            return client.appId == appId;
        });

        if (index >= 0) {
            options.clients.splice(index, 1);
        }

        console.log(colors.green("Client removed: " + appId));

        this.saveConfig(options);
    }

    /**
     * Gets the config file with the provided args
     */
    getConfigFile(file: string = null, dir: string = null): string {
        const filePath = path.join(
            dir || "",
            file || "laravel-echo-server.json"
        );

        return path.isAbsolute(filePath)
            ? filePath
            : path.join(process.cwd(), filePath);
    }

    /**
     * Tries to read a config file
     */
    readConfigFile(file: string): any {
        let data = {};

        try {
            data = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
            console.error(
                colors.error(
                    "Error: There was a problem reading the config file."
                )
            );
            process.exit();
        }

        return this.resolveEnvFileOptions(data);
    }
}
