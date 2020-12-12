FROM node:lts-alpine

WORKDIR /app

RUN apk add --update --no-cache curl

COPY . /app

RUN npm ci && npm run prepublish

RUN ln -s /app/bin/server.js /usr/bin/laravel-echo-server

COPY bin/docker-entrypoint bin/health-check /usr/local/bin/

ENTRYPOINT ["docker-entrypoint"]

VOLUME /app

EXPOSE 6001

HEALTHCHECK --interval=30s --timeout=5s \
        CMD /usr/local/bin/health-check

CMD ["start"]
