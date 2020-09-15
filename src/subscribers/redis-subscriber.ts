var Redis = require('ioredis');
import { Log } from './../log';
import { Subscriber } from './subscriber';

export class RedisSubscriber implements Subscriber {
    /**
     * Redis pub/sub client.
     *
     * @type {object}
     */
    private _redis: any;

    /**
     *
     * KeyPrefix for used in the redis Connection
     *
     * @type {String}
     */
    private _keyPrefix: string;

    /**
     * Create a new instance of subscriber.
     *
     * @param {any} options
     */
    constructor(private options) {
        this._keyPrefix = options.databaseConfig.redis.keyPrefix || '';
        if(options.databaseConfig.redis.nodes && options.databaseConfig.redis.nodes.length != 0) {
            this._redis = new Redis.Cluster(options.databaseConfig.redis.nodes, options.databaseConfig.redis.options);
        } else {
            this._redis = new Redis(options.databaseConfig.redis);
        }
    }

    /**
     * Subscribe to events to broadcast.
     *
     * @return {Promise<any>}
     */
    subscribe(callback): Promise<any> {

        return new Promise((resolve, reject) => {
            this._redis.on('pmessage', (subscribed, channel, message) => {
                try {
                    message = JSON.parse(message);

                    if (this.options.devMode) {
                        Log.info("Channel: " + channel);
                        Log.info("Event: " + message.event);
                    }

                    callback(channel.substring(this._keyPrefix.length), message);
                } catch (e) {
                    if (this.options.devMode) {
                        Log.info("No JSON message");
                    }
                }
            });

            this._redis.psubscribe(`${this._keyPrefix}*`, (err, count) => {
                if (err) {
                    reject('Redis could not subscribe.')
                }

                Log.success('Listening for redis events...');

                resolve();
            });
        });
    }

    /**
     * Unsubscribe from events to broadcast.
     *
     * @return {Promise}
     */
    unsubscribe(): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                this._redis.disconnect();
                resolve();
            } catch(e) {
                reject('Could not disconnect from redis -> ' + e);
            }
        });
    }
}
