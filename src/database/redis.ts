import { DatabaseDriver } from './database-driver';
var Redis = require('ioredis');

export class RedisDatabase implements DatabaseDriver {
    /**
     * Redis client.
     */
    private _redis: any;

    /**
     * Create a new cache instance.
     */
    constructor(private options) {
        if(options.databaseConfig.redis.nodes && options.databaseConfig.redis.nodes.length != 0) {
            this._redis = new Redis.Cluster(options.databaseConfig.redis.nodes, options.databaseConfig.redis.options);
        } else {
            this._redis = new Redis(options.databaseConfig.redis);
        }
    }

    /**
     * Retrieve data from redis.
     */
    get(key: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            this._redis.get(key).then(value => resolve(JSON.parse(value)));
        });
    }

    /**
     * Store data to cache.
     */
    set(key: string, value: any): void {
        this._redis.set(key, JSON.stringify(value));
        if (this.options.databaseConfig.publishPresence === true && /^presence-.*:members$/.test(key)) {
            this._redis.publish('PresenceChannelUpdated', JSON.stringify({
                "event": {
                    "channel": key,
                    "members": value
                }
            }));
        }
    }
}
