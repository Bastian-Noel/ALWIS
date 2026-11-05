FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

ARG ALWIS_VERSION=development
ARG ALWIS_REVISION=unknown
LABEL org.opencontainers.image.title="ALWIS Server" \
      org.opencontainers.image.description="ALWIS web studio served by a configurable Node.js container" \
      org.opencontainers.image.source="https://github.com/Bastian-Noel/ALWIS" \
      org.opencontainers.image.version="${ALWIS_VERSION}" \
      org.opencontainers.image.revision="${ALWIS_REVISION}"

ENV NODE_ENV=production \
    ALWIS_VERSION=${ALWIS_VERSION} \
    ALWIS_SITE_DIR=/app/site \
    ALWIS_DATA_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app
COPY --chown=10001:10001 server/server.mjs server/server-config.html ./
COPY --chown=10001:10001 build-work/server-site/ ./site/
RUN mkdir -p /data /tmp && chown 10001:10001 /data /tmp && chmod 0750 /data

USER 10001:10001
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node --disable-warning=ExperimentalWarning -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "/app/server.mjs"]
