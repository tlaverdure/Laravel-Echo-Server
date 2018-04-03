let request = require('request');
let url = require('url');
import { Channel } from './channel';
import { Log } from './../log';

export class PrivateChannel {
    /**
     * Request client.
     *
     * @type {any}
     */
    private request: any;

    /**
     * Create a new private channel instance.
     *
     * @param {any} options
     */
    constructor(private options: any) {
        this.request = request;
    }

    /**
     * Send authentication request to application server.
     *
     * @param  {any} socket
     * @param  {any} data
     * @return {Promise<any>}
     */
    authenticate(socket: any, data: any): Promise<any> {
        let options = {
            url: this.authHost(socket) + this.options.authEndpoint,
            form: { channel_name: data.channel, socket_id: socket.id },
            headers: (data.auth && data.auth.headers) ? data.auth.headers : {},
            rejectUnauthorized: false
        };

        return this.serverRequest(socket, options);
    }

    /**
     * Send leave notice to application server.
     *
     * @param  {any} socket
     * @param  {any} member
     * @param  {array} channels
     * @return {void}
     */
    leaveNotice(socket: any, member: any, channels: Array<string>) : void {
        member.socket_id = member.socketId;
        delete member.socketId;

        let client = this.options.clients[0];

        let options = {
            url: this.authHost(socket) + this.options.leaveEndpoint,
            form: { member: member, channel_names: channels },
            auth: { username: client.appId, password: client.key }
        };

        this.request.post(options, (error, response) => {
            if (error || response.statusCode !== 200) {
                Log.error(error || response.body);
            }
        });
    }

    /**
     * Get the auth host based on the Socket.
     *
     * @param {any} socket
     * @return {string}
     */
    protected authHost(socket: any): string {
		let authHosts = (this.options.authHost) ?
			this.options.authHost : this.options.host;

		if (typeof authHosts === "string") {
			authHosts = [authHosts];
		}

		let authHostSelected = authHosts[0] || 'http://localhost';

		if(socket.request.headers.referer) {
			let referer = url.parse(socket.request.headers.referer);

			for (let authHost of authHosts) {
				authHostSelected = authHost;
	
				if (this.hasMatchingHost(referer, authHost)) {
					authHostSelected = `${referer.protocol}//${referer.host}`;
					break;
				}
			};
		}

        return authHostSelected;
    }

    /**
     * Check if there is a matching auth host.
     *
     * @param  {any}  referer
     * @param  {any}  host
     * @return {boolean}
     */
    protected hasMatchingHost(referer: any, host: any): boolean {
        return referer.hostname.substr(referer.hostname.indexOf('.')) === host ||
            `${referer.protocol}//${referer.host}` === host ||
            referer.host === host;
    }

    /**
     * Send a request to the server.
     *
     * @param  {any} socket
     * @param  {any} options
     * @return {Promise<any>}
     */
    protected serverRequest(socket: any, options: any): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            options.headers = this.prepareHeaders(socket, options);
            let body;

            this.request.post(options, (error, response, body, next) => {
                if (error) {
                    if (this.options.devMode) {
                        Log.error(`[${new Date().toLocaleTimeString()}] - Error authenticating ${socket.id} for ${options.form.channel_name}`);
                    }

                    Log.error(error);

                    reject({ reason: 'Error sending authentication request.', status: 0 });
                } else if (response.statusCode !== 200) {
                    if (this.options.devMode) {
                        Log.warning(`[${new Date().toLocaleTimeString()}] - ${socket.id} could not be authenticated to ${options.form.channel_name}`);
                        Log.error(response.body);
                    }

                    reject({ reason: 'Client can not be authenticated, got HTTP status ' + response.statusCode, status: response.statusCode });
                } else {
                    if (this.options.devMode) {
                        Log.info(`[${new Date().toLocaleTimeString()}] - ${socket.id} authenticated for: ${options.form.channel_name}`);
                    }

                    try {
                        body = JSON.parse(response.body);
                    } catch (e) {
                        body = response.body
                    }

                    resolve(body);
                }
            });
        });
    }

    /**
     * Prepare headers for request to app server.
     *
     * @param  {any} socket
     * @param  {any} options
     * @return {any}
     */
    protected prepareHeaders(socket: any, options: any): any {
        options.headers['Cookie'] = socket.request.headers.cookie;
        options.headers['X-Requested-With'] = 'XMLHttpRequest';

        return options.headers;
    }
}
