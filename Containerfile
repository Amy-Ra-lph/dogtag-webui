FROM registry.access.redhat.com/ubi10-minimal as build
RUN microdnf -y --nodocs --setopt=install_weak_deps=0 install \
        nodejs24-npm \
    && microdnf clean all \
    && alternatives --install /usr/bin/node node /usr/bin/node-24 24 \
    && alternatives --install /usr/bin/npm npm /usr/bin/npm-24 24
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM registry.access.redhat.com/ubi10-minimal
RUN microdnf -y --nodocs --setopt=install_weak_deps=0 install \
        nginx \
    && microdnf clean all \
    && mkdir -p /etc/nginx/certs

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/container.conf /etc/nginx/conf.d/default.conf.template

ENV CA_TARGET_URL=https://localhost:8443
ENV REKOR_URL=""

USER root
RUN printf '#!/bin/sh\nsed -e "s|\\${CA_TARGET_URL}|$CA_TARGET_URL|g" -e "s|\\${REKOR_URL}|$REKOR_URL|g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf\nif [ -z "$REKOR_URL" ]; then sed -i "/location \\/rekor/,/^    }/d" /etc/nginx/conf.d/default.conf; fi\nexec nginx -g "daemon off;"\n' > /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh
USER 1001

EXPOSE 8080
CMD ["/docker-entrypoint.sh"]
