#!/bin/sh
set -x

_init () {
    scheme="http://"
    address="$(netstat -nplt 2>/dev/null | awk ' /(.*\/laravel-echo-serv)/ { gsub(":::","127.0.0.1:",$4); print $4}')"
    resource="/socket.io/socket.io.js"
    start=$(stat -c "%Y" /proc/1)
}

fn_health_check () {
    # In distributed environment like Swarm, traffic is routed
    # to a container only when it reports a `healthy` status. So, we exit
    # with 0 to ensure healthy status till distributed service starts (120s).
    #
    # Refer: https://github.com/moby/moby/pull/28938#issuecomment-301753272
    if [[ $(( $(date +%s) - start )) -lt 120 ]]; then
        exit 0
    else
        # Get the http response code
        http_response=$(curl -s -k -o /dev/null -w "%{http_code}" ${scheme}${address}${resource})

        # Get the http response body
        http_response_body=$(curl -k -s ${scheme}${address}${resource})

        # server returns response 403 and body "SSL required" if non-TLS
        # connection is attempted on a TLS-configured server. Change
        # the scheme and try again
        if [[ "$http_response" = "403" ]] && [[ "$http_response_body" = "SSL required" ]]; then
            scheme="https://"
            http_response=$(curl -s -k -o /dev/null -w "%{http_code}" ${scheme}${address}${resource})
        fi

        # If http_response is 200 - server is up.
        [[ "$http_response" = "200" ]]
    fi
}

_init && fn_health_check
