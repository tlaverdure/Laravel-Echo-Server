import { HttpSubscriber, RedisSubscriber, SocketSubscriber } from './subscribers';
import { Channel } from './channels';
import { Server } from './server';
import { HttpApi } from './api';
import { Log } from './log';

const packageFile = require('../package.json');

/**
 * Echo server class.
 */
export class EchoServer {
    /**
     * Default server options.
     *
     * @type {object}
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
        socket: false,
        eventForwarding: false,
        receivingMethods: ['redis', 'socket', 'http'],
        devMode: false,
        host: null,
        port: 6001,
        protocol: "http",
        socketio: {},
        sslCertPath: '',
        sslKeyPath: ''
    };

    /**
     * Configurable server options.
     *
     * @type {object}
     */
    public options: any;

    /**
     * Socket.io server instance.
     *
     * @type {Server}
     */
    private server: Server;

    /**
     * Channel instance.
     *
     * @type {Channel}
     */
    private channel: Channel;

    /**
     * Redis subscriber instance.
     *
     * @type {RedisSubscriber}
     */
    private redisSub: RedisSubscriber;

    /**
     * Http subscriber instance.
     *
     * @type {HttpSubscriber}
     */
    private httpSub: HttpSubscriber;

    /**
     * Socket subscriber instance
     *
     * @type {SocketSubscriber}
     */
    private socketSub: SocketSubscriber;

    /**
     * Http api instance.
     *
     * @type {HttpApi}
     */
    private httpApi: HttpApi;

    /**
     * Create a new instance.
     */
    constructor() { }

    /**
     * Start the Echo Server.
     *
     * @param  {Object} config
     * @return {Promise}
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
     *
     * @param {any} io
     */
    init(io: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.channel = new Channel(io, this.options);
            this.redisSub = new RedisSubscriber(this.options);
            this.socketSub = new SocketSubscriber(this.options);
            this.httpSub = new HttpSubscriber(this.server.express, this.options);
            this.httpApi = new HttpApi(io, this.channel, this.server.express);
            this.httpApi.init();

            this.onConnect();
            this.listen().then(() => resolve());
        });
    }

    /**
     * Text shown at startup.
     *
     * @return {void}
     */
    startup(): void {
        Log.title(`\nL A R A V E L  E C H O  S E R V E R\n`);
        Log.info(`version ${packageFile.version}\n`);

        if (this.options.devMode) {
            Log.warning('Starting server in DEV mode...\n');
        } else {
            Log.info('Starting server...\n');
        }

        if (this.options.eventForwarding) {
            Log.warning('This server is forwarding its events...\n');
        }
    }

    /**
     * Listen for incoming event from subscibers.
     *
     * @return {void}
     */
    listen(): Promise<any> {
        return new Promise((resolve, reject) => {
            const promises = [];

            if (this.options.receivingMethods.includes('http')) {
                promises.push(this.httpSub.subscribe(this.broadcast.bind(this)));
            }

            if (this.options.receivingMethods.includes('redis')) {
                promises.push(this.redisSub.subscribe(this.broadcast.bind(this)));
            }

            if (this.options.receivingMethods.includes('socket')) {
                promises.push(this.socketSub.subscribe(this.broadcast.bind(this)));
            }

            Promise.all(promises).then(() => resolve());
        });
    }

    /**
     * Return a channel by its socket id.
     *
     * @param  {string} socket_id
     * @return {any}
     */
    find(socket_id: string): any {
        return this.server.io.sockets.connected[socket_id];
    }

    /**
     * Broadcast events to channels from subscribers.
     *
     * @param  {string} channel
     * @param  {any} message
     * @return {void}
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
     *
     * @param  {any} socket
     * @param  {string} channel
     * @param  {any} message
     * @return {boolean}
     */
    toOthers(socket: any, channel: string, message: any): boolean {
        this.to(socket.broadcast, channel, message);

        return true
    }

    /**
     * Broadcast to all members on channel.
     *
     * @param  {any} socket
     * @param  {string} channel
     * @param  {any} message
     * @return {boolean}
     */
    toAll(channel: string, message: any): boolean {
        this.to(this.server.io, channel, message);

        return true
    }

    /**
     * Emits to the socket depending on whether
     * @param network
     * @param channel
     * @param message
     */
    private to (network: any, channel: string, message: any) {
        if (this.options.eventForwarding) {
            network.emit('event', {
                channel,
                message
            });
        }
        else {
            network.to(channel).emit(message.event, channel, message.data);
        }
    }

    /**
     * On server connection.
     *
     * @return {void}
     */
    onConnect(): void {
        this.server.io.on('connection', socket => {
            if (this.options.eventForwarding && this.options.devMode) {
                Log.info(`[${new Date().toLocaleTimeString()}] - ${socket.id} child connected`);
            }

            this.onSubscribe(socket);
            this.onUnsubscribe(socket);
            this.onDisconnecting(socket);
            this.onClientEvent(socket);
        });
    }

    /**
     * On subscribe to a channel.
     *
     * @param  {object} socket
     * @return {void}
     */
    onSubscribe(socket: any): void {
        socket.on('subscribe', data => {
            this.channel.join(socket, data);
        });
    }

    /**
     * On unsubscribe from a channel.
     *
     * @param  {object} socket
     * @return {void}
     */
    onUnsubscribe(socket: any): void {
        socket.on('unsubscribe', data => {
            this.channel.leave(socket, data.channel, 'unsubscribed');
        });
    }

    /**
     * On socket disconnecting.
     *
     * @return {void}
     */
    onDisconnecting(socket: any): void {
        socket.on('disconnecting', (reason) => {
            if (this.options.eventForwarding && this.options.devMode) {
                Log.info(`[${new Date().toLocaleTimeString()}] - ${socket.id} child disconnected`);
            }

            Object.keys(socket.rooms).forEach(room => {
                if (room !== socket.id) {
                    this.channel.leave(socket, room, reason);
                }
            });
        });
    }

    /**
     * On client events.
     *
     * @param  {object} socket
     * @return {void}
     */
    onClientEvent(socket: any): void {
        socket.on('client event', data => {
            this.channel.clientEvent(socket, data);
        });
    }
}
