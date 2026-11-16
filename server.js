const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdtemp, readFile, readdir, rm, stat } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = __dirname;
const MAX_REQUEST_BYTES = 4096;
const MAX_CHAT_BYTES = 30 * 1024 * 1024;
const MAX_CHAT_MESSAGES = 300000;
const EXTRACTION_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PROCESS_OUTPUT = 32 * 1024;
const STATIC_FILES = new Set([
  "app.js",
  "apple-touch-icon.png",
  "favicon.svg",
  "index.html",
  "styles.css",
]);

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseReplayLink(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new AppError(400, "Enter a valid YouTube video or Twitch VOD link.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "Enter a valid YouTube video or Twitch VOD link.");
  }

  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new AppError(400, "Use a public HTTPS YouTube or Twitch replay link.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com") {
    const videoId = host === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") || url.pathname.match(/^\/(?:live|shorts|embed)\/([^/]+)/)?.[1];
    if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
      throw new AppError(400, "That YouTube link does not contain a valid video ID.");
    }
    return { platform: "youtube", id: videoId, url: url.href };
  }

  if (host === "twitch.tv" || host === "m.twitch.tv") {
    const videoId = url.pathname.match(/^\/(?:[^/]+\/)?videos\/(\d+)(?:\/|$)/)?.[1];
    if (!videoId) throw new AppError(400, "Use a Twitch VOD link, not a channel or clip link.");
    return { platform: "twitch", id: videoId, url: url.href };
  }

  throw new AppError(400, "Only YouTube videos and Twitch VODs are supported.");
}

function textFromRuns(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (!Array.isArray(value.runs)) return "";
  return value.runs.map((run) => run?.text || run?.emoji?.shortcuts?.[0] || "").join("");
}

function youtubeActionText(action) {
  const details = action?.addChatItemAction || action?.addLiveChatTickerItemAction;
  const item = details?.item;
  if (!item) return "";
  const renderer = item.liveChatTextMessageRenderer || item.liveChatPaidMessageRenderer ||
    item.liveChatMembershipItemRenderer || item.liveChatPaidStickerRenderer ||
    item.liveChatTickerPaidMessageItemRenderer || item.liveChatTickerSponsorItemRenderer;
  if (!renderer) return "";
  return [
    renderer.message,
    renderer.headerSubtext,
    renderer.subtext,
    renderer.primaryText,
  ].map(textFromRuns).find(Boolean) || "";
}

function parseYoutubeChat(content) {
  let entries;
  try {
    const parsed = JSON.parse(content);
    entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : [parsed];
  } catch {
    try {
      entries = content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    } catch {
      throw new AppError(502, "YouTube returned chat data in an unsupported format.");
    }
  }

  const messages = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    if (Array.isArray(entry.segs)) {
      const text = entry.segs.map((segment) => segment?.utf8 || "").join("").trim();
      const time = Number(entry.tStartMs) / 1000;
      if (text && Number.isFinite(time)) messages.push({ time, text });
      continue;
    }

    const replay = entry.replayChatItemAction;
    const offset = Number(replay?.videoOffsetTimeMsec ?? entry.videoOffsetTimeMsec) / 1000;
    const actions = replay?.actions || entry.actions || [];
    for (const action of actions) {
      const text = youtubeActionText(action).trim();
      if (text && Number.isFinite(offset)) messages.push({ time: offset, text });
    }
  }

  return messages;
}

function parseTwitchChat(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    throw new AppError(502, "Twitch returned chat data in an unsupported format.");
  }
  if (!data || typeof data !== "object") {
    throw new AppError(502, "Twitch returned chat data in an unsupported format.");
  }
  const rows = Array.isArray(data) ? data : Array.isArray(data.comments) ? data.comments :
    Array.isArray(data.messages) ? data.messages : [];
  return rows.map((row) => {
    if (!row || typeof row !== "object") return null;
    let text = row.message ?? row.text ?? row.body ?? "";
    if (text && typeof text === "object") text = text.body ?? text.text ?? "";
    return {
      time: Number(row.content_offset_seconds ?? row.contentOffsetSeconds ?? row.offset ?? row.time),
      text: typeof text === "string" ? text.trim() : "",
    };
  }).filter((row) => row && Number.isFinite(row.time) && row.time >= 0 && row.text);
}

function addOutput(current, chunk) {
  return (current + chunk.toString("utf8")).slice(-MAX_PROCESS_OUTPUT);
}

function runCommand(binary, args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timeout;
    let killTimeout;
    const child = spawn(binary, args, { shell: false, windowsHide: true });

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimeout);
      if (error) reject(error);
      else resolve(result);
    };

    timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimeout = setTimeout(() => child.kill("SIGKILL"), 3000);
    }, EXTRACTION_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout = addOutput(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = addOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        finish(new AppError(503, `Required chat extractor "${binary}" is not installed or not on PATH.`));
      } else {
        finish(new AppError(502, `Could not start chat extractor: ${error.message}`));
      }
    });
    child.on("close", (code) => {
      if (timedOut) {
        finish(new AppError(504, "Chat retrieval timed out. Try a shorter replay or try again later."));
      } else if (code !== 0) {
        const detail = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" ");
        finish(new AppError(502, detail || "The chat extractor could not retrieve this replay."));
      } else {
        finish(null, { stdout, stderr });
      }
    });
  });
}

async function findChatFile(directory, pattern) {
  const names = await readdir(directory);
  const name = names.find((entry) => pattern.test(entry));
  if (!name) throw new AppError(422, "No replay chat was available for that link.");
  const file = path.join(directory, name);
  const details = await stat(file);
  if (details.size > MAX_CHAT_BYTES) {
    throw new AppError(413, "This replay has too much chat to analyze in one request.");
  }
  return readFile(file, "utf8");
}

async function extractReplay(replay) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "clxped-chat-"));
  try {
    let messages;
    let title;
    if (replay.platform === "youtube") {
      const outputTemplate = path.join(temporaryDirectory, "%(id)s.%(ext)s");
      const result = await runCommand(process.env.YTDLP_BIN || "yt-dlp", [
        "--ignore-config",
        "--no-warnings",
        "--no-progress",
        "--no-playlist",
        "--skip-download",
        "--match-filter", "live_status!=is_live & live_status!=is_upcoming",
        "--write-subs",
        "--sub-langs", "live_chat",
        "--print", "%(title)s",
        "--output", outputTemplate,
        "--",
        replay.url,
      ]);
      const chat = await findChatFile(temporaryDirectory, /\.live_chat\.(?:json|json3)$/i);
      messages = parseYoutubeChat(chat);
      title = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "YouTube replay";
    } else {
      const output = path.join(temporaryDirectory, "chat.json");
      await runCommand(process.env.TWITCH_DOWNLOADER_BIN || "TwitchDownloaderCLI", [
        "chatdownload",
        "--id", replay.id,
        "--output", output,
      ]);
      const chat = await findChatFile(temporaryDirectory, /^chat\.json$/i);
      messages = parseTwitchChat(chat);
      title = `Twitch VOD ${replay.id}`;
    }

    if (!messages.length) throw new AppError(422, "No chat messages were found in that replay.");
    if (messages.length > MAX_CHAT_MESSAGES) {
      throw new AppError(413, "This replay has too many chat messages to analyze in one request.");
    }
    const duration = messages.reduce((maximum, message) => Math.max(maximum, message.time), 0);
    return { platform: replay.platform, title, duration, messages };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function readJsonRequest(request) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
      reject(new AppError(415, "Send the replay link as JSON."));
      request.resume();
      return;
    }

    let body = "";
    let finished = false;
    request.on("data", (chunk) => {
      if (finished) return;
      body += chunk.toString("utf8");
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
        finished = true;
        reject(new AppError(413, "The request is too large."));
        request.resume();
      }
    });
    request.on("end", () => {
      if (finished) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new AppError(400, "The request body must be valid JSON."));
      }
    });
    request.on("error", (error) => {
      if (!finished) reject(error);
    });
  });
}

function contentType(file) {
  return ({
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  })[path.extname(file)] || "application/octet-stream";
}

function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  const fileName = relativePath.replace(/^\/+/, "");
  if (!STATIC_FILES.has(fileName)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const file = path.join(ROOT, fileName);

  readFile(file).then((content) => {
    response.writeHead(200, {
      "content-type": contentType(file),
      "x-content-type-options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  }).catch((error) => {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404);
      response.end("Not found");
    } else {
      response.writeHead(500);
      response.end("Unable to read file");
    }
  });
}

function createAppServer({ retrieveChat = extractReplay } = {}) {
  let activeExtractions = 0;
  return createServer(async (request, response) => {
    let pathname;
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    if (pathname !== "/api/analyze") {
      serveStatic(request, response, pathname);
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end();
      return;
    }
    if (activeExtractions >= 2) {
      sendJson(response, 429, { error: "The analysis server is busy. Try again in a moment." });
      return;
    }

    activeExtractions += 1;
    try {
      const body = await readJsonRequest(request);
      const replay = parseReplayLink(body?.url);
      const result = await retrieveChat(replay);
      sendJson(response, 200, result);
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (status >= 500) console.error("Replay analysis failed:", error);
      sendJson(response, status, {
        error: error instanceof AppError ? error.message : "The server could not analyze that replay.",
      });
    } finally {
      activeExtractions -= 1;
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  createAppServer().listen(port, host, () => {
    console.log(`Clxped is running at http://${host}:${port}`);
  });
}

module.exports = {
  createAppServer,
  extractReplay,
  parseReplayLink,
  parseTwitchChat,
  parseYoutubeChat,
};
