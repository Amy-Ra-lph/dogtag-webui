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

COPY nginx/docker-entrypoint.sh /docker-entrypoint.sh

ENV CA_TARGET_URL=https://localhost:8443
ENV REKOR_URL=""

USER 1001

EXPOSE 8080 8443
CMD ["/docker-entrypoint.sh"]
