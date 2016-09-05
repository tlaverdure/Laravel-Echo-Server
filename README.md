# Laravel Echo Server

NodeJs server for Laravel Echo broadcasting with Socket.io.

## System Requirements

The following are required to function properly.

* Laravel 5.3
* Node 6.0+
* Redis 3+

Additional information on broadcasting with Laravel can be found on the official docs:
https://laravel.com/docs/master/broadcasting

## Getting Started

Install npm package

```
npm install laravel-echo-server --save
```

Create a server.js file and include the following.

```js

var echo = require('laravel-echo-server');

echo.run();

```

Start server from the command line

```
$ node server.js
```


### With Configurable Options

Edit the default configuration of the server.

```js
var echo = require('laravel-echo-server');

var options = {
  authHost: 'http://app.dev',
  authPath: '/broadcasting/auth',
  host: 'http://app.dev',
  port: 6001,
  sslCertPath: '/path/to/app.dev.cert',
  sslKeyPath: '/path/to/app.dev.key',
    redisConfig: {
    port: 6379,          // Redis port
    host: '127.0.0.1',   // Redis host
    family: 4,           // 4 (IPv4) or 6 (IPv6)
    password: 'auth',
    db: 0
  }
};

echo.run(options);
```

| Title | Default | Description |
| :------------- | :------------- | :------------- |
| `authHost` | `http://localhost` | The host of the server that authenticates private and presence channels  |
| `authPath` | `/broadcasting/auth` | The route that authenticates private channels  |
| `host` | `http://localhost` | The host of the socket.io server |
| `port` | `6001` | The port that the socket.io server should run on |
| `sslCertPath` | `string` | The path to your server's ssl certificate |
| `sslKeyPath` | `string` | The path to your server's ssl key |

### Running with SSL

After adding paths to your ssl certificate and key located on your server, socket.io should be accessible on https.

*Note: Currently only supports either http or https, not both.*

## Client Side Configuration

See the offical Laravel documentation. https://laravel.com/docs/5.3/broadcasting#introduction
