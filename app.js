const form = document.querySelector("#analyze-form");
const input = document.querySelector("#video-url");
const fileInput = document.querySelector("#chat-file");
const uploadButton = document.querySelector("#upload-button");
const uploadName = document.querySelector("#upload-name");
const formMessage = document.querySelector("#form-message");
const analyzeButton = document.querySelector("#analyze-button");
const toast = document.querySelector("#toast");
const peakList = document.querySelector("#peak-list");
const binSize = 30;
let toastTimeout;

function isSupportedReplay(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    if (host === "youtu.be") return /^[\w-]{6,20}$/.test(url.pathname.split("/").filter(Boolean)[0] || "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:live|shorts|embed)\/([^/]+)/)?.[1];
      return /^[\w-]{6,20}$/.test(videoId || "");
    }
    if (host === "twitch.tv" || host === "m.twitch.tv") {
      return /^\/(?:[^/]+\/)?videos\/\d+(?:\/|$)/.test(url.pathname);
    }
  } catch {
    return false;
  }
  return false;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 4200);
}

function setFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("is-error", isError);
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error("The CSV has an unfinished quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one chat message.");

  const headers = rows[0].map(normalizeHeader);
  const timeIndex = headers.findIndex((header) => [
    "time", "timestamp", "createdat", "contentoffsetseconds", "offset", "seconds", "videotime",
  ].includes(header));
  const messageIndex = headers.findIndex((header) => [
    "message", "text", "body", "content", "comment",
  ].includes(header));
  if (timeIndex < 0 || messageIndex < 0) {
    throw new Error("CSV headers must include a timestamp/time and a message/text column.");
  }

  return rows.slice(1).map((values) => ({
    time: values[timeIndex],
    text: values[messageIndex],
  }));
}

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);

  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/);
  if (clock) {
    return (Number(clock[1] || 0) * 3600) + (Number(clock[2]) * 60) + Number(clock[3]) +
      (clock[4] ? Number(`0.${clock[4]}`) : 0);
  }

  const date = Date.parse(text);
  return Number.isNaN(date) ? null : date / 1000;
}

function extractJsonRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["messages", "comments", "chat", "data"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The JSON file could not be read. Check that it is valid JSON.");
  }

  return extractJsonRows(data).map((item) => {
    if (!item || typeof item !== "object") return { time: null, text: "" };
    const time = item.content_offset_seconds ?? item.contentOffsetSeconds ?? item.offset ??
      item.seconds ?? item.time ?? item.timestamp ?? item.created_at ?? item.createdAt;
    let message = item.message ?? item.text ?? item.body ?? item.content ?? item.comment ?? "";
    if (message && typeof message === "object") message = message.body ?? message.text ?? "";
    return { time, text: typeof message === "string" ? message : "" };
  });
}

function parseChat(text, fileName) {
  const rows = fileName.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{") ||
    text.trimStart().startsWith("[")
    ? parseJson(text)
    : parseCsv(text);
  const parsed = rows.map((row) => ({
    time: parseTimestamp(row.time),
    text: String(row.text || "").trim(),
  })).filter((row) => row.time !== null && row.text);

  if (!parsed.length) {
    throw new Error("No usable messages found. Include a timestamp/time and message/text for each row.");
  }
  if (parsed.length > 500000) throw new Error("This export has too many messages to analyze in one file.");

  const numericTimes = parsed.map((message) => message.time);
  const minimumTime = numericTimes.reduce((minimum, time) => Math.min(minimum, time), Infinity);
  const maximumTime = numericTimes.reduce((maximum, time) => Math.max(maximum, time), -Infinity);
  const epochLike = numericTimes.some((time) => time > 100000000);
  const isMilliseconds = epochLike && maximumTime > 100000000000;
  const baseTime = epochLike ? minimumTime : 0;
  const messages = parsed.map((message) => ({
    time: Math.max(0, message.time / (isMilliseconds ? 1000 : 1) - baseTime / (isMilliseconds ? 1000 : 1)),
    text: message.text,
  }));
  const duration = messages.reduce((maximum, message) => Math.max(maximum, message.time), 0);
  if (duration > 7 * 24 * 3600) throw new Error("Chat timestamps span more than seven days; check the export format.");
  return { messages, skipped: rows.length - parsed.length };
}

function findPeaks(messages) {
  const lastMessageTime = messages.reduce((maximum, message) => Math.max(maximum, message.time), 0);
  const binCount = Math.max(1, Math.floor(lastMessageTime / binSize) + 1);
  const bins = Array.from({ length: binCount }, () => []);
  messages.forEach((message) => bins[Math.floor(message.time / binSize)].push(message.text));
  const average = messages.length / binCount;
  const cutoff = Math.max(3, average * 1.5);
  const candidates = [];

  bins.forEach((items, index) => {
    const previous = bins[index - 1]?.length ?? 0;
    const next = bins[index + 1]?.length ?? 0;
    if (items.length >= cutoff && items.length >= previous && items.length > next) {
      candidates.push({ index, count: items.length, messages: items });
    }
  });

  const selected = [];
  candidates.sort((a, b) => b.count - a.count).forEach((peak) => {
    if (selected.every((other) => Math.abs(other.index - peak.index) * binSize >= 60)) selected.push(peak);
  });
  return {
    bins: bins.map((items) => items.length),
    average,
    peaks: selected.sort((a, b) => b.count - a.count).map((peak) => ({
      time: peak.index * binSize,
      count: peak.count,
      ratio: peak.count / average,
      excerpts: [...new Set(peak.messages)].slice(0, 3),
    })),
  };
}

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatCount(count) {
  return count.toLocaleString();
}

function replayAtTime(value, seconds) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "twitch.tv") {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    url.searchParams.set("t", `${hours}h${minutes}m${remainder}s`);
  } else {
    url.searchParams.set("t", String(seconds));
  }
  return url.href;
}

function renderPeaks(result, total, fileName, skipped, replay = null) {
  const peaks = result.peaks;
  const replayUrl = input.value.trim();
  peakList.replaceChildren();

  document.querySelector("#message-count").textContent = formatCount(total);
  document.querySelector("#peak-count").textContent = String(peaks.length);
  document.querySelector("#peak-list-count").textContent = `(${peaks.length})`;
  document.querySelector("#biggest-moment").textContent = peaks.length ? formatTime(peaks[0].time) : "—";
  document.querySelector("#video-title").textContent = replay?.title || fileName.replace(/\.(csv|json)$/i, "");
  document.querySelector("#video-platform").textContent = replay
    ? `${replay.platform.toUpperCase()} CHAT REPLAY`
    : "UPLOADED CHAT EXPORT";
  document.querySelector("#video-meta").textContent =
    `${formatCount(total)} messages · ${formatTime(replay?.duration ?? result.bins.length * binSize)}`;
  document.querySelector("#results-state").textContent = "ANALYZED CHAT";
  document.querySelector("#results-caption").textContent = replay
    ? `Peaks detected from public ${replay.platform} replay chat.`
    : "Peaks detected from message volume in your export.";
  document.querySelector("#results-footnote").lastChild.textContent =
    replay
      ? "Peaks use 30-second message counts. Chat is retrieved from the replay and not stored."
      : "Peaks use 30-second message counts; uploaded chat exports stay in your browser.";
  document.querySelector(".peak-tooltip").textContent = peaks.length
    ? `PEAK · ${formatTime(peaks[0].time)}`
    : "NO PEAKS FOUND";
  document.querySelector("#chart-state").textContent = "ANALYZED";

  if (!peaks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-peaks";
    empty.textContent = "No unusually busy moments found. Try a longer chat export or one with more activity variation.";
    peakList.append(empty);
  }

  peaks.forEach((peak) => {
    const row = document.createElement("button");
    row.className = "peak-row";
    row.type = "button";
    row.dataset.time = formatTime(peak.time);
    row.setAttribute("aria-pressed", "false");

    const time = document.createElement("span");
    time.className = "peak-time";
    time.innerHTML = '<span class="play-icon">▶</span>';
    time.append(document.createTextNode(` ${formatTime(peak.time)}`));

    const copy = document.createElement("span");
    copy.className = "peak-copy";
    const heading = document.createElement("strong");
    heading.textContent = `Chat spike · ${formatCount(peak.count)} messages in 30 sec`;
    const excerpts = document.createElement("span");
    excerpts.textContent = peak.excerpts.map((message) => `“${message}”`).join(" · ");
    copy.append(heading, excerpts);

    const volume = document.createElement("span");
    volume.className = "peak-volume";
    const bars = document.createElement("span");
    bars.className = "mini-bars";
    bars.setAttribute("aria-hidden", "true");
    const ratio = document.createElement("strong");
    ratio.textContent = `${peak.ratio.toFixed(1)}×`;
    const average = document.createElement("span");
    average.textContent = "avg. chat";
    volume.append(bars, ratio, average);

    const jump = document.createElement("span");
    jump.className = "peak-jump";
    jump.textContent = replayUrl ? "Jump to replay ↗" : "Add replay link ↗";
    row.append(time, copy, volume, jump);
    row.addEventListener("click", () => {
      peakList.querySelectorAll(".peak-row").forEach((item) => {
        const selected = item === row;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      const currentReplayUrl = input.value.trim();
      if (isSupportedReplay(currentReplayUrl)) {
        window.open(replayAtTime(currentReplayUrl, peak.time), "_blank", "noopener,noreferrer");
      } else {
        showToast(`Peak at ${formatTime(peak.time)} selected. Add a replay link to jump to it.`);
      }
    });
    peakList.append(row);
  });

  renderChart(result.bins, peaks[0]);
  const suffix = skipped ? ` ${skipped} rows were skipped.` : "";
  setFormMessage(`Analyzed ${formatCount(total)} messages and found ${peaks.length} peak${peaks.length === 1 ? "" : "s"}.${suffix}`);
  showToast(`Found ${peaks.length} chat peak${peaks.length === 1 ? "" : "s"} in ${replay?.title || fileName}.`);
  document.querySelector("#moments").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderChart(bins, peak) {
  const visible = bins.length > 100 ? bins.filter((_, index) => index % Math.ceil(bins.length / 100) === 0) : bins;
  const max = Math.max(1, ...visible);
  const points = visible.map((count, index) => ({
    x: (index / Math.max(1, visible.length - 1)) * 420,
    y: 138 - (count / max) * 118,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  document.querySelector("#chart-line").setAttribute("d", line);
  document.querySelector("#chart-area").setAttribute("d", `${line} L420 150 L0 150 Z`);
  const peakX = peak ? (peak.time / (Math.max(1, bins.length - 1) * binSize)) * 420 : 0;
  const peakY = peak ? 138 - (peak.count / max) * 118 : 0;
  const peakGuide = document.querySelector("#peak-guide");
  const peakDot = document.querySelector("#peak-dot");
  peakGuide.hidden = !peak;
  peakDot.hidden = !peak;
  peakGuide.setAttribute("x1", peakX);
  peakGuide.setAttribute("x2", peakX);
  peakDot.setAttribute("cx", peakX);
  peakDot.setAttribute("cy", peakY);
  const duration = bins.length * binSize;
  document.querySelector("#chart-axis").replaceChildren(...[0, 1, 2, 3].map((step) => {
    const label = document.createElement("span");
    label.textContent = formatTime(Math.round(duration * step / 3));
    return label;
  }));
  document.querySelector(".signal-count").innerHTML =
    `${peak ? `${peak.ratio.toFixed(1)}×` : "—"} <span>above avg.</span>`;
}

input.addEventListener("input", () => {
  const hasReplay = isSupportedReplay(input.value.trim());
  peakList.querySelectorAll(".peak-jump").forEach((label) => {
    label.textContent = hasReplay ? "Jump to replay ↗" : "Add replay link ↗";
  });
});

async function analyzeFile(file) {
  if (!file) {
    setFormMessage("Paste a replay link or choose a CSV/JSON chat export.", true);
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    setFormMessage("This file is larger than 20 MB. Choose a smaller chat export.", true);
    return;
  }
  const replayUrl = input.value.trim();
  if (replayUrl && !isSupportedReplay(replayUrl)) {
    setFormMessage("The replay link must be a YouTube video or Twitch VOD URL.", true);
    input.focus();
    return;
  }
  analyzeButton.disabled = true;
  analyzeButton.querySelector("span:first-child").textContent = "Analyzing...";
  try {
    const parsed = parseChat(await file.text(), file.name);
    renderPeaks(findPeaks(parsed.messages), parsed.messages.length, file.name, parsed.skipped);
  } catch (error) {
    setFormMessage(error.message, true);
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.querySelector("span:first-child").textContent = "Find chat peaks";
  }
}

async function analyzeReplay(value) {
  if (!value) {
    setFormMessage("Paste a YouTube video or Twitch VOD link first.", true);
    input.focus();
    return;
  }
  if (!isSupportedReplay(value)) {
    setFormMessage("Use a public HTTPS YouTube video or Twitch VOD link.", true);
    input.focus();
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.querySelector("span:first-child").textContent = "Finding chat...";
  setFormMessage("Retrieving public chat. This can take a little while...");
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: value }),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The analysis server returned an invalid response.");
    }
    if (!response.ok) throw new Error(data.error || "Could not retrieve chat for that replay.");
    if (!Array.isArray(data.messages) || !["youtube", "twitch"].includes(data.platform) ||
      typeof data.title !== "string" || !data.title.trim() ||
      !Number.isFinite(data.duration) || data.duration < 0 ||
      !data.messages.every((message) => message && Number.isFinite(message.time) && message.time >= 0 &&
        typeof message.text === "string" && message.text.trim())) {
      throw new Error("The analysis server returned invalid chat data.");
    }

    const replay = {
      platform: data.platform,
      title: data.title,
      duration: Number.isFinite(data.duration) ? data.duration : undefined,
    };
    const result = findPeaks(data.messages);
    renderPeaks(result, data.messages.length, `${data.title || "Replay"} chat`, 0, replay);
  } catch (error) {
    setFormMessage(
      error instanceof TypeError
        ? "Could not reach the analysis server. Start the website with npm start and try again."
        : error.message,
      true,
    );
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.querySelector("span:first-child").textContent = "Find chat peaks";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const replayUrl = input.value.trim();
  if (replayUrl) analyzeReplay(replayUrl);
  else analyzeFile(fileInput.files[0]);
});

uploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  uploadName.textContent = fileInput.files[0]?.name || "CSV or JSON fallback";
  if (fileInput.files[0]) analyzeFile(fileInput.files[0]);
});
