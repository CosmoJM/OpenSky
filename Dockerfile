# OpenSky in a container: MagicMirror runs server-only and tablets/phones/PCs open it in a browser.
#   docker compose up -d --build      then browse to http://<this-computer>:8080
FROM node:24-bookworm-slim

ARG MM_VERSION=v2.38.0
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates python3 python3-venv tini tzdata \
    && rm -rf /var/lib/apt/lists/*

# MagicMirror (pinned, same tag as install.sh)
WORKDIR /opt
RUN git -c advice.detachedHead=false clone -q --depth 1 --branch "$MM_VERSION" \
      https://github.com/MagicMirrorOrg/MagicMirror /opt/MagicMirror \
 && cd /opt/MagicMirror && npm run install-mm >/tmp/mm.log 2>&1 || (cat /tmp/mm.log; exit 1)

# CalDAV helper
COPY services/calendar-service/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install -q --no-cache-dir -r /tmp/requirements.txt

# OpenSky itself, wired into MagicMirror (community modules are cloned here at build time)
COPY . /opt/opensky
RUN /opt/opensky/tools/link-mm.sh /opt/MagicMirror

# (OPENSKY_DRY_RUN: there is no Pi to dim, sleep or restart in a container)
# Settings + data live in a volume: /config (opensky.json, secrets.json, lists.json, local-calendar.json…)
ENV OPENSKY_SETTINGS=/config/opensky.json \
    OPENSKY_SECRETS=/config/secrets.json \
    OPENSKY_LOCAL_CALENDAR=/config/local-calendar.json \
    OPENSKY_LOCAL_LISTS=/config/lists.json \
    OPENSKY_CALENDAR_CACHE=/config/calendar-cache \
    OPENSKY_MM=/opt/MagicMirror \
    OPENSKY_ADDRESS=0.0.0.0 \
    OPENSKY_IP_WHITELIST=all \
    OPENSKY_DRY_RUN=1 \
    TZ=UTC
VOLUME /config
EXPOSE 8080 8090

COPY tools/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
WORKDIR /opt/MagicMirror
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
