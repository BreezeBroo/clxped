const assert = require("node:assert/strict");
const { chmod, mkdtemp, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const {
  createAppServer,
  extractReplay,
  parseReplayLink,
  parseTwitchChat,
  parseYoutubeChat,
} = require("../server");

const server = createAppServer({
  retrieveChat: async (replay) => ({
    platform: replay.platform,
    title: `Replay ${replay.id}`,
    duration: 30,
    messages: [{ time: 12, text: "hello chat" }],
  }),
});
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("accepts supported YouTube and Twitch replay links only", () => {
  assert.equal(parseReplayLink("https://www.youtube.com/watch?v=abcdefghijk").platform, "youtube");
  assert.equal(parseReplayLink("https://www.twitch.tv/channel/videos/123456").platform, "twitch");
  assert.throws(() => parseReplayLink("https://example.com/watch?v=abcdefghijk"), /Only YouTube/);
  assert.throws(() => parseReplayLink("http://www.youtube.com/watch?v=abcdefghijk"), /HTTPS/);
  assert.throws(() => parseReplayLink("https://www.twitch.tv/channel/clip/slug"), /VOD link/);
});

test("reads YouTube replay chat action streams and JSON3 events", () => {
  const action = {
    replayChatItemAction: {
      videoOffsetTimeMsec: "12500",
      actions: [{
        addChatItemAction: {
          item: {
            liveChatTextMessageRenderer: {
              message: { runs: [{ text: "Peak " }, { text: "message" }] },
            },
          },
        },
      }],
    },
  };
  assert.deepEqual(parseYoutubeChat(JSON.stringify(action)), [{ time: 12.5, text: "Peak message" }]);
  assert.deepEqual(parseYoutubeChat(JSON.stringify({
    events: [{ tStartMs: "30000", segs: [{ utf8: "JSON3 message" }] }],
  })), [{ time: 30, text: "JSON3 message" }]);
});

test("reads TwitchDownloader chat JSON", () => {
  assert.deepEqual(parseTwitchChat(JSON.stringify({
    comments: [{
      content_offset_seconds: 24,
      message: { body: "Twitch message" },
    }],
  })), [{ time: 24, text: "Twitch message" }]);
});

test("retrieves replay chat through the configured platform extractors", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "clxped-extractor-test-"));
  const ytDlp = path.join(directory, "yt-dlp");
  const twitchDownloader = path.join(directory, "TwitchDownloaderCLI");
  const oldYtDlp = process.env.YTDLP_BIN;
  const oldTwitchDownloader = process.env.TWITCH_DOWNLOADER_BIN;

  await writeFile(ytDlp, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const template = args[args.indexOf("--output") + 1];
const output = template.replace("%(id)s", "videoid12345").replace("%(ext)s", "live_chat.json");
const event = { replayChatItemAction: { videoOffsetTimeMsec: "12500", actions: [{
  addChatItemAction: { item: { liveChatTextMessageRenderer: { message: { simpleText: "hello" } } } }
}] } };
fs.writeFileSync(output, JSON.stringify(event) + "\\n");
console.log("YouTube test replay");
`);
  await writeFile(twitchDownloader, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const output = args[args.indexOf("--output") + 1];
fs.writeFileSync(output, JSON.stringify({ comments: [{
  content_offset_seconds: 24,
  message: { body: "hello from Twitch" }
}] }));
`);
  await chmod(ytDlp, 0o755);
  await chmod(twitchDownloader, 0o755);

  try {
    process.env.YTDLP_BIN = ytDlp;
    process.env.TWITCH_DOWNLOADER_BIN = twitchDownloader;
    const youtube = await extractReplay(parseReplayLink("https://youtu.be/abcdefghijk"));
    const twitch = await extractReplay(parseReplayLink("https://twitch.tv/channel/videos/123456"));
    assert.deepEqual(youtube.messages, [{ time: 12.5, text: "hello" }]);
    assert.equal(youtube.title, "YouTube test replay");
    assert.deepEqual(twitch.messages, [{ time: 24, text: "hello from Twitch" }]);
    assert.equal(twitch.title, "Twitch VOD 123456");
  } finally {
    if (oldYtDlp === undefined) delete process.env.YTDLP_BIN;
    else process.env.YTDLP_BIN = oldYtDlp;
    if (oldTwitchDownloader === undefined) delete process.env.TWITCH_DOWNLOADER_BIN;
    else process.env.TWITCH_DOWNLOADER_BIN = oldTwitchDownloader;
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports missing extractor setup explicitly", async () => {
  const oldYtDlp = process.env.YTDLP_BIN;
  process.env.YTDLP_BIN = path.join(os.tmpdir(), `missing-yt-dlp-${process.pid}`);
  try {
    await assert.rejects(
      extractReplay(parseReplayLink("https://youtu.be/abcdefghijk")),
      (error) => error.status === 503 && /not installed or not on PATH/.test(error.message),
    );
  } finally {
    if (oldYtDlp === undefined) delete process.env.YTDLP_BIN;
    else process.env.YTDLP_BIN = oldYtDlp;
  }
});

test("API analyzes a replay link and rejects unsupported targets", async () => {
  const valid = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://youtu.be/abcdefghijk" }),
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), {
    platform: "youtube",
    title: "Replay abcdefghijk",
    duration: 30,
    messages: [{ time: 12, text: "hello chat" }],
  });

  const invalid = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/video" }),
  });
  assert.equal(invalid.status, 400);
});

test("serves the website but does not expose backend source files", async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Paste a YouTube video or Twitch VOD link/);

  const source = await fetch(`${baseUrl}/server.js`);
  assert.equal(source.status, 404);
});
