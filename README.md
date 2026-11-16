# clxped

Clxped is a static, browser-only chat activity analyzer. Choose a CSV or JSON
chat export to find 30-second message-volume peaks; files are read locally and
are not uploaded. An optional YouTube video or Twitch VOD URL adds a jump link
to each detected peak. A replay URL by itself does not contain chat data, so
you need an export from the platform or a compatible chat downloader.

## Supported chat export formats

CSV files need a timestamp column (`time`, `timestamp`, `created_at`,
`content_offset_seconds`, `offset`, `seconds`, or `video_time`) and a message
column (`message`, `text`, `body`, `content`, or `comment`). JSON can be an
array of messages or an object containing a `messages`, `comments`, `chat`, or
`data` array. Each message needs a time and text/body/message field. Timestamps
can be seconds, `MM:SS`/`HH:MM:SS`, or date-time strings.

The sample button runs generated sample messages through the same detector.