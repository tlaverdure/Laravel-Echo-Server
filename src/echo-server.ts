import { HttpSubscriber, RedisSubscriber, Subscriber } from './subscribers';
import { Channel } from './channels';
import { Server } from './server';
import { HttpApi } from './api';
import { Log } from './log';
import * as fs from 'fs';
const packageFile = require('../package.json');
const { constants } = require('crypto');

/**
 * Echo server class.
 */
export class EchoServer {
    /**
     * Default server options.
     */
    public defaultOptions: any = {
        authHost: 'http://localhost',
        authEndpoint: '/broadcasting/auth',
        clients: [],
        database: 'redis',
        databaseConfig: {
            redis: {},
            sqlite: {
                databasePath: '/database/laravel-echo-server.sqlite'
            }
        },
        devMode: false,
        host: null,
        port: 6001,
        protocol: "http",
        socketio: {},
        secureOptions: constants.SSL_OP_NO_TLSv1,
        sslCertPath: '',
        sslKeyPath: '',
        sslCertChainPath: '',
        sslPassphrase: '',
        subscribers: {
            http: true,
            redis: true
        },
        apiOriginAllow: {
            allowCors: false,
            allowOrigin: '',
            allowMethods: '',
            allowHeaders: ''
        },
        hookHost: null,
        hooks: {
            "onJoinEndpoint": null,
            "onLeaveEndpoint": null,
            "onClientEventEndpoint": null
        },
        rejectUnautorized: ''
    };

    /**
     * Configurable server options.
     */
    public options: any;

    /**
     * Socket.io server instance.
     */
    private server: Server;

    /**
     * Channel instance.
     */
    private channel: Channel;

    /**
     * Subscribers
     */
    private subscribers: Subscriber[];

    /**
     * Http api instance.
     */
    private httpApi: HttpApi;

    /**
     * Create a new instance.
     */
    constructor() { }

    /**
     * Start the Echo Server.
     */
    run(options: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.options = Object.assign(this.defaultOptions, options);
            this.startup();
            this.server = new Server(this.options);

            this.server.init().then(io => {
                this.init(io).then(() => {
                    Log.info('\nServer ready!\n');
                    resolve(this);
                }, error => Log.error(error));
            }, error => Log.error(error));
        });
    }

    /**
     * Initialize the class
     */
    init(io: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.channel = new Channel(io, this.options);

            this.subscribers = [];
            if (this.options.subscribers.http)
                this.subscribers.push(new HttpSubscriber(this.server.express, this.options));
            if (this.options.subscribers.redis)
                this.subscribers.push(new RedisSubscriber(this.options));

            this.httpApi = new HttpApi(io, this.channel, this.server.express, this.options.apiOriginAllow);
            this.httpApi.init();

            this.onConnect();
            this.listen().then(() => resolve(), err => Log.error(err));
        });
    }

    /**
     * Text shown at startup.
     */
    startup(): void {
        Log.title(`\nL A R A V E L  E C H O  S E R V E R\n`);
        Log.info(`version ${packageFile.version}\n`);

        if (this.options.devMode) {
            Log.warning('Starting server in DEV mode...\n');
        } else {
            Log.info('Starting server...\n')
        }
        
        Log.info(`Searching hooks...\n`);
    }

    /**
     * Stop the echo server.
     */
    stop(): Promise<any> {
        console.log('Stopping the LARAVEL ECHO SERVER')
        let promises = [];
        this.subscribers.forEach(subscriber => {
            promises.push(subscriber.unsubscribe());
        });
        promises.push(this.server.io.close());
        return Promise.all(promises).then(() => {
            this.subscribers = [];
            console.log('The LARAVEL ECHO SERVER server has been stopped.');
        });
    }

    /**
     * Listen for incoming event from subscibers.
     */
    listen(): Promise<any> {
        return new Promise((resolve, reject) => {
            let subscribePromises = this.subscribers.map(subscriber => {
                return subscriber.subscribe((channel, message) => {
                    return this.broadcast(channel, message);
                });
            });

            Promise.all(subscribePromises).then(() => resolve());
        });
    }

    /**
     * Return a channel by its socket id.
     */
    find(socket_id: string): any {
        return this.server.io.sockets.connected[socket_id];
    }

    /**
     * Broadcast events to channels from subscribers.
     */
    broadcast(channel: string, message: any): boolean {
        if (message.socket && this.find(message.socket)) {
            return this.toOthers(this.find(message.socket), channel, message);
        } else {
            return this.toAll(channel, message);
        }
    }

    /**
     * Broadcast to others on channel.
     */
    toOthers(socket: any, channel: string, message: any): boolean {
        socket.broadcast.to(channel)
            .emit(message.event, channel, message.data);

        return true
    }

    /**
     * Broadcast to all members on channel.
     */
    toAll(channel: string, message: any): boolean {
        this.server.io.to(channel)
            .emit(message.event, channel, message.data);

        return true
    }

    /**
     * On server connection.
     */
    onConnect(): void {
        this.server.io.on('connection', socket => {
            this.onSubscribe(socket);
            this.onUnsubscribe(socket);
            this.onDisconnecting(socket);
            this.onClientEvent(socket);
        });
    }

    /**
     * On subscribe to a channel.
     */
    onSubscribe(socket: any): void {
        socket.on('subscribe', data => {
            this.channel.join(socket, data);
        });
    }

    /**
     * On unsubscribe from a channel.
     */
    onUnsubscribe(socket: any): void {
        socket.on('unsubscribe', data => {
            this.channel.leave(socket, data.channel, 'unsubscribed', data.auth);
        });
    }

    /**
     * On socket disconnecting.
     */
    onDisconnecting(socket: any): void {
        socket.on('disconnecting', (reason) => {
            Object.keys(socket.rooms).forEach(room => {
                if (room !== socket.id) {
                    this.channel.leave(socket, room, reason, {});
                }
            });
        });
    }

    /**
     * On client events.
     */
    onClientEvent(socket: any): void {
        socket.on('client event', data => {
            this.channel.clientEvent(socket, data);
        });
    }
}
