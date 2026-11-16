# clxped

Clxped finds chat activity peaks from public YouTube replays and Twitch VODs.
Paste a replay link and the local Node server retrieves available chat, then
the browser groups messages into 30-second intervals and highlights spikes.
You can still upload a CSV or JSON chat export as a fallback; uploaded files
are read in the browser and are not sent to the server.
Active YouTube livestreams, private videos, and replays without available chat
are not analyzed.

## Run locally

1. Install Node.js 18 or newer.
2. Install the replay chat extractors:
   - [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) for YouTube.
   - [TwitchDownloaderCLI](https://github.com/lay295/TwitchDownloader#cli) for Twitch.
3. Make both commands available on `PATH`, or set `YTDLP_BIN` and
   `TWITCH_DOWNLOADER_BIN` to their executable paths.
4. Run `npm start` and open <http://127.0.0.1:3000>.

The extractors retrieve public replay chat only; Clxped does not download the
video or store the chat. Chat retrieval depends on the platform making replay
chat available, and extraction tools may need updates when platform formats
change.

## Deploying

The server binds to `127.0.0.1` by default. For a public deployment, set
`HOST` and `PORT` as needed, and put the service behind authentication and
rate limiting before exposing it to the internet. Install the matching
extractor binaries in the server environment.

## Supported chat export formats

CSV files need a timestamp column (`time`, `timestamp`, `created_at`,
`content_offset_seconds`, `offset`, `seconds`, or `video_time`) and a message
column (`message`, `text`, `body`, `content`, or `comment`). JSON can be an
array of messages or an object containing a `messages`, `comments`, `chat`, or
`data` array. Each message needs a time and text/body/message field. Timestamps
can be seconds, `MM:SS`/`HH:MM:SS`, or date-time strings.

Run the focused checks with `npm test`.
