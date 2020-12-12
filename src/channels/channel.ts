let request = require('request');
import { PresenceChannel } from './presence-channel';
import { PrivateChannel } from './private-channel';
import { Log } from './../log';

export class Channel {
    /**
     * Channels and patters for private channels.
     */
    protected _privateChannels: string[] = ['private-*', 'presence-*'];

    /**
     * Allowed client events
     */
    protected _clientEvents: string[] = ['client-*'];

    /**
     * Request client.
     *
     * @type {any}
     */
    private request: any;


    /**
     * Private channel instance.
     */
    private: PrivateChannel;

    /**
     * Presence channel instance.
     */
    presence: PresenceChannel;

    /**
     * Create a new channel instance.
     */
    constructor(private io, private options) {
        this.private = new PrivateChannel(options);
        this.presence = new PresenceChannel(io, options);
        this.request = request;

        if (this.options.devMode) {
            Log.success('Channels are ready.');
        }
    }

    /**
     * Join a channel.
     */
    join(socket, data): void {
        if (data.channel) {
            if (this.isPrivate(data.channel)) {
                this.joinPrivate(socket, data);
            } else {
                socket.join(data.channel);
                this.onJoin(socket, data.channel, data.auth);
            }
        }
    }

    /**
     * Trigger a client message
     */
    clientEvent(socket, data): void {
        try {
            data = JSON.parse(data);
        } catch (e) {
            data = data;
        }

        if (data.event && data.channel) {
            if (this.isClientEvent(data.event) &&
                this.isPrivate(data.channel) &&
                this.isInChannel(socket, data.channel)) {
                this.io.sockets.connected[socket.id]
                    .broadcast.to(data.channel)
                    .emit(data.event, data.channel, data.data);
                this.hook(socket, data.channel, data.auth, "onClientEvent");
            }
        }
    }

    /**
     * Leave a channel.
     */
    leave(socket: any, channel: string, reason: string, auth: any): void {
        if (channel) {
            if (this.isPresence(channel)) {
                this.presence.leave(socket, channel)
            }

            socket.leave(channel);

            if (this.options.devMode) {
                Log.info(`[${new Date().toISOString()}] - ${socket.id} left channel: ${channel} (${reason})`);
            }

            this.hook(socket, channel, auth, "onLeave");
        }
    }

    /**
     * Check if the incoming socket connection is a private channel.
     */
    isPrivate(channel: string): boolean {
        let isPrivate = false;

        this._privateChannels.forEach(privateChannel => {
            let regex = new RegExp(privateChannel.replace('\*', '.*'));
            if (regex.test(channel)) isPrivate = true;
        });

        return isPrivate;
    }

    /**
     * Join private channel, emit data to presence channels.
     */
    joinPrivate(socket: any, data: any): void {
        this.private.authenticate(socket, data).then(res => {
            socket.join(data.channel);

            if (this.isPresence(data.channel)) {
                var member = res.channel_data;
                try {
                    member = JSON.parse(res.channel_data);
                } catch (e) { }

                this.presence.join(socket, data.channel, member);
            }

            this.onJoin(socket, data.channel, data.auth);
        }, error => {
            if (this.options.devMode) {
                Log.error(error.reason);
            }

            this.io.sockets.to(socket.id)
                .emit('subscription_error', data.channel, error.status);
        });
    }

    /**
     * Check if a channel is a presence channel.
     */
    isPresence(channel: string): boolean {
        return channel.lastIndexOf('presence-', 0) === 0;
    }

    /**
     * On join a channel log success.
     */
    onJoin(socket: any, channel: string,  auth: any): void {
        if (this.options.devMode) {
            Log.info(`[${new Date().toISOString()}] - ${socket.id} joined channel: ${channel}`);
        }
        
        this.hook(socket, channel, auth, "onJoin");
    }

    /**
     * Check if client is a client event
     */
    isClientEvent(event: string): boolean {
        let isClientEvent = false;

        this._clientEvents.forEach(clientEvent => {
            let regex = new RegExp(clientEvent.replace('\*', '.*'));
            if (regex.test(event)) isClientEvent = true;
        });

        return isClientEvent;
    }

    /**
     * Check if a socket has joined a channel.
     */
    isInChannel(socket: any, channel: string): boolean {
        return !!socket.rooms[channel];
    }

    /**
     * 
     * @param {any} socket 
     * @param {string} channel
     * @param {object} auth 
     * @param {string} hookEndpoint 
     * @param {string} hookName 
     */
    hook(socket:any, channel: any, auth: any, hookName: string) {
        if (typeof this.options.hookHost == 'undefined' ||
            !this.options.hookHost ||
            typeof this.options.hooks == 'undefined' ||
            !this.options.hooks) {
            return;
        }

        let hookEndpoint = this.getHookEndpoint(hookName, channel);

        if (hookEndpoint == null) {
            return;
        }

        let options = this.prepareHookHeaders(socket, auth, channel, hookEndpoint)

        this.request.post(options, (error, response, body, next) => {
            if (error) {
                if (this.options.devMode) {
                    Log.error(`[${new Date().toLocaleTimeString()}] - Error call ${hookName} hook ${socket.id} for ${options.form.channel_name}`);
                }

                Log.error(error);
            } else if (response.statusCode !== 200) {
                if (this.options.devMode) {
                    Log.warning(`[${new Date().toLocaleTimeString()}] - Error call ${hookName} hook ${socket.id} for ${options.form.channel_name}`);
                    Log.error(response.body);
                }
            } else {
                if (this.options.devMode) {
                    Log.info(`[${new Date().toLocaleTimeString()}] - Call ${hookName} hook for ${socket.id} for ${options.form.channel_name}: ${response.body}`);
                }
            }
        });
    }

    /**
     * Get hook endpoint for request to app server.
     * 
     * @param {string} hookName 
     * @returns {string}
     */
    getHookEndpoint(hookName: string, channel: any): string {
        let hookEndpoint = null;
        switch(hookName) { 
            case "onJoin": {
                if (!this.options.hooks.onJoinEndpoint) {
                    break;
                }
                if (this.options.hooks.onJoinRegexp && !(new RegExp(this.options.hooks.onJoinRegexp)).test(channel)) {
                    break;
                }
                hookEndpoint = this.options.hooks.onJoinEndpoint;
                break; 
            } 
            case "onLeave": {
                if (!this.options.hooks.onLeaveEndpoint) {
                    break;
                }
                if (this.options.hooks.onLeaveRegexp && !(new RegExp(this.options.hooks.onLeaveRegexp)).test(channel)) {
                    break;
                }
                hookEndpoint = this.options.hooks.onLeaveEndpoint;
                break;
            } 
            case "onClientEvent": {
                if (!this.options.hooks.onClientEventEndpoint) {
                    break;
                }
                hookEndpoint = this.options.hooks.onClientEventEndpoint;
                break;
            } 
            default: {
                Log.error('cannot find hookEndpoint for hookName: ' + hookName);
                break;          
            } 
        }
        return hookEndpoint;
    }

    /**
     * Prepare headers for request to app server.
     * 
     * @param {any} socket
     * @param {any} auth
     * @param {string} channel
     * @param {string} hookEndpoint
     * @returns {any}
     */
    prepareHookHeaders(socket: any, auth: any, channel: string, hookEndpoint: string): any {
        let options = {
            url: this.options.hookHost + hookEndpoint,
            form: { channel_name: channel },
            headers: (auth && auth.headers) ? auth.headers : {}
        };
        options.headers['Cookie'] = socket.request.headers.cookie;
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
        return options;
    }
}
