# clxped

Clxped finds chat activity peaks from public YouTube replays and Twitch VODs.
Paste a replay link and the local Node server retrieves available chat, then
the browser groups messages into 30-second intervals and highlights spikes.
You can still upload a CSV or JSON chat export as a fallback; uploaded files
are read in the browser and are not sent to the server.
Active YouTube livestreams, private videos, and replays without available chat
are not analyzed.

## GitHub Pages and public access

GitHub Pages only serves static files; it cannot run the replay extractors.
To keep the public Pages frontend and enable link analysis for visitors, deploy
the included backend as a public HTTPS service:

1. Build the container: `docker build -t clxped .`
2. Deploy it on a Docker-capable host with port `3000` exposed. The image
   includes pinned, checksum-verified builds of yt-dlp and TwitchDownloaderCLI.
3. Set `ALLOWED_ORIGINS=https://breezebroo.github.io` on the backend. The
   backend also serves the site itself at its root URL.
4. After the host gives you its public URL, set
   `window.CLXPED_API_BASE_URL = "https://your-backend.example.com";` in
   [api-config.js](./api-config.js), then push the change to GitHub Pages.

The API URL is public configuration, not a secret. The backend accepts
cross-origin requests only from the configured origin, limits each client to
12 analyses per 10 minutes, and runs at most two extractors at once. Keep the
backend on HTTPS.

## Run locally

Install Node.js 18 or newer, plus [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)
and [TwitchDownloaderCLI](https://github.com/lay295/TwitchDownloader#cli). Put
the extractor commands on `PATH` or set `YTDLP_BIN` and
`TWITCH_DOWNLOADER_BIN`, then run `npm start` and open
<http://127.0.0.1:3000>.

The extractors retrieve public replay chat only; Clxped does not download the
video or store the chat. Chat retrieval depends on the platform making replay
chat available, and extraction tools may need updates when platform formats
change.

## Supported chat export formats

CSV files need a timestamp column (`time`, `timestamp`, `created_at`,
`content_offset_seconds`, `offset`, `seconds`, or `video_time`) and a message
column (`message`, `text`, `body`, `content`, or `comment`). JSON can be an
array of messages or an object containing a `messages`, `comments`, `chat`, or
`data` array. Each message needs a time and text/body/message field. Timestamps
can be seconds, `MM:SS`/`HH:MM:SS`, or date-time strings.

Run the focused checks with `npm test`.
