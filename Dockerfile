FROM node:22-bookworm-slim

ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libicu72 unzip \
    && set -eux; \
    case "$TARGETARCH" in \
      amd64) \
        ytdlp_asset="yt-dlp_linux"; \
        ytdlp_sha256="767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795"; \
        twitch_asset="TwitchDownloaderCLI-1.56.5-Linux-x64.zip"; \
        twitch_sha256="f2bcee00d0e6da759d97c23767345634cb9cdb10cdff96cfa96f97983d51bf55"; \
        ;; \
      arm64) \
        ytdlp_asset="yt-dlp_linux_aarch64"; \
        ytdlp_sha256="e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483"; \
        twitch_asset="TwitchDownloaderCLI-1.56.5-LinuxArm64.zip"; \
        twitch_sha256="2fde836f07c3ebfcf61cace23742a2c43543fc30fda96071eb96ab8e10c24f7f"; \
        ;; \
      *) echo "Unsupported image architecture: $TARGETARCH"; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/${ytdlp_asset}" -o /usr/local/bin/yt-dlp; \
    echo "${ytdlp_sha256}  /usr/local/bin/yt-dlp" | sha256sum -c -; \
    chmod 755 /usr/local/bin/yt-dlp; \
    curl -fsSL "https://github.com/lay295/TwitchDownloader/releases/download/1.56.5/${twitch_asset}" -o /tmp/twitch-downloader.zip; \
    echo "${twitch_sha256}  /tmp/twitch-downloader.zip" | sha256sum -c -; \
    mkdir -p /opt/twitchdownloader; \
    unzip -q /tmp/twitch-downloader.zip -d /opt/twitchdownloader; \
    chmod 755 /opt/twitchdownloader/TwitchDownloaderCLI; \
    apt-get purge -y --auto-remove curl unzip; \
    rm -rf /var/lib/apt/lists/* /tmp/twitch-downloader.zip

WORKDIR /app
COPY app.js api-config.js index.html package.json server.js styles.css favicon.svg apple-touch-icon.png ./

ENV HOST=0.0.0.0
ENV PORT=3000
ENV TWITCH_DOWNLOADER_BIN=/opt/twitchdownloader/TwitchDownloaderCLI
ENV ALLOWED_ORIGINS=https://breezebroo.github.io

EXPOSE 3000
CMD ["npm", "start"]
