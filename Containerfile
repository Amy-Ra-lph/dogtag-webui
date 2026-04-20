FROM registry.access.redhat.com/ubi9/nodejs-18-minimal:latest AS build
USER root
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM registry.access.redhat.com/ubi9/nginx-122:latest
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/container.conf /etc/nginx/conf.d/default.conf.template

ENV CA_TARGET_URL=https://localhost:8443

USER root
RUN printf '#!/bin/sh\nsed "s|\\${CA_TARGET_URL}|$CA_TARGET_URL|g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf\nexec nginx -g "daemon off;"\n' > /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh
USER 1001

EXPOSE 8080
CMD ["/docker-entrypoint.sh"]
