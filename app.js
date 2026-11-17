const tabs = [...document.querySelectorAll(".tool-tab")];
const panel = document.querySelector("#tool-panel");
const panelTitle = document.querySelector("#panel-title");
const panelDescription = document.querySelector("#panel-description");
const panelContent = document.querySelector("#panel-content");
const stage = document.querySelector("#preview-stage");
const video = document.querySelector("#video-preview");
const clip = document.querySelector("#clip-block");
const playhead = document.querySelector("#playhead");
const toast = document.querySelector("#toast");
const projectName = document.querySelector("#project-name");
const projectStatus = document.querySelector("#project-status");
const titleOverlay = document.querySelector("#game-title");
const titleCopy = document.querySelector("#game-title-copy");
const facecamOverlay = document.querySelector("#facecam-frame");
const inspector = document.querySelector("#inspector");
const timeDisplay = document.querySelector("#current-time");
const durationDisplay = document.querySelector("#duration-time");
const timelineDuration = document.querySelector("#timeline-duration");

const panelMarkup = {
  media: {
    title: "Media",
    description: "Add a recording to get started.",
    label: "Media",
  },
  captions: {
    title: "Captions",
    description: "Give every clutch moment a voice.",
    label: "Captions",
    html: `
      <button class="primary-button" type="button" data-action="add-captions">Add captions to clip</button>
      <div class="caption-option"><div><strong>Auto captions</strong><br><span>Generate from your video audio</span></div><span>Coming soon</span></div>
      <div class="section-label"><span>Caption style</span></div>
      <button class="caption-option" type="button" data-action="caption-style"><strong>Bold highlight</strong><span> Aa </span></button>
      <p class="panel-note">Caption generation isn't available in this preview. You can still add and position text overlays on the canvas.</p>`,
  },
  templates: {
    title: "Templates",
    description: "Start with a format made for your platform.",
    label: "Templates",
    html: `
      <div class="template-grid">
        <button class="template-card" type="button" data-ratio="vertical"><span class="template-art vertical">GG</span><span>TikTok / Reels</span></button>
        <button class="template-card" type="button" data-ratio="vertical"><span class="template-art vertical">SHORTS</span><span>YouTube Shorts</span></button>
        <button class="template-card" type="button" data-ratio="landscape"><span class="template-art landscape">HIGHLIGHT</span><span>Stream highlight</span></button>
        <button class="template-card" type="button" data-ratio="landscape"><span class="template-art landscape">LET'S PLAY</span><span>Gameplay cut</span></button>
      </div>
      <p class="panel-note">Choose a layout to change your canvas aspect ratio. Add your own text and facecam framing on the preview.</p>`,
  },
  elements: {
    title: "Elements",
    description: "Little details that make it yours.",
    label: "Elements",
    html: `
      <div class="element-list">
        <button class="element-button" type="button" data-action="sticker" data-value="🔥"><svg viewBox="0 0 24 24" fill="none"><path d="M12.5 3c.4 3.4-2.8 4.4-2.8 7.3 0 1.2.7 2 1.6 2.4-.2-2 1.3-2.8 2.1-3.8 2.2 1.7 3.6 4.1 3.6 6.7a5 5 0 0 1-10 0c0-2.2 1-4.2 2.7-5.8C9.3 7 11 4.7 12.5 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>Fire</button>
        <button class="element-button" type="button" data-action="sticker" data-value="GG"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5 14.3 9l5.8.4-4.4 3.8 1.4 5.7-5.1-3-5.1 3 1.4-5.7-4.4-3.8 5.8-.4L12 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>GG badge</button>
        <button class="element-button" type="button" data-action="add-facecam"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" /><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5" /><path d="M7.5 17a5.5 5.5 0 0 1 9 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>Facecam</button>
      </div>
      <button class="secondary-button" type="button" data-action="add-text">＋ &nbsp; Add text overlay</button>
      <p class="panel-note">Drag text and facecam overlays directly on the preview. Select one to adjust its size.</p>`,
  },
};

let toastTimeout;
let objectUrl = null;
let activeFile = null;
let trimStart = 0;
let trimEnd = 0;
let splitAt = null;
let zoom = 100;
let history = [];
let future = [];
let titlePosition = { x: 7, y: 9 };
let facecamPosition = { x: 76, y: 58 };
let titleScale = 100;
let facecamScale = 100;
let selectedOverlay = null;
let titleText = "insane clutch";
let extraSticker = null;
let captionsAdded = false;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function currentState() {
  return {
    ratio: stage.classList.contains("is-vertical") ? "vertical" : "landscape",
    trimStart,
    trimEnd,
    splitAt,
    titlePosition: { ...titlePosition },
    facecamPosition: { ...facecamPosition },
    titleScale,
    facecamScale,
    titleText,
    extraSticker,
    captionsAdded,
  };
}

function updateHistoryButtons() {
  document.querySelector("#undo-button").disabled = history.length === 0;
  document.querySelector("#redo-button").disabled = future.length === 0;
}

function saveHistory() {
  history.push(currentState());
  if (history.length > 50) history.shift();
  future = [];
  updateHistoryButtons();
}

function applyState(state) {
  stage.classList.toggle("is-vertical", state.ratio === "vertical");
  document.querySelectorAll(".ratio-button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.ratio === state.ratio));
  });
  trimStart = state.trimStart;
  trimEnd = state.trimEnd;
  splitAt = state.splitAt;
  titlePosition = { ...state.titlePosition };
  facecamPosition = { ...state.facecamPosition };
  titleScale = state.titleScale;
  facecamScale = state.facecamScale;
  titleText = state.titleText;
  extraSticker = state.extraSticker;
  captionsAdded = state.captionsAdded;
  titleOverlay.style.left = `${titlePosition.x}%`;
  titleOverlay.style.top = `${titlePosition.y}%`;
  titleOverlay.style.fontSize = `calc(clamp(14px, 1.8vw, 23px) * ${titleScale / 100})`;
  titleCopy.textContent = titleText;
  titleOverlay.setAttribute("aria-label", `Text overlay: ${titleText}. Select to adjust.`);
  document.querySelector("#overlay-copy").value = titleText;
  facecamOverlay.style.left = `${facecamPosition.x}%`;
  facecamOverlay.style.top = `${facecamPosition.y}%`;
  facecamOverlay.style.right = "auto";
  facecamOverlay.style.bottom = "auto";
  facecamOverlay.style.width = `${18 * facecamScale / 100}%`;
  document.querySelector("#overlay-size").value = String(Math.round(
    selectedOverlay === facecamOverlay ? facecamScale : titleScale,
  ));
  renderTimeline();
  renderExtraSticker();
  renderCaptions();
}

function undo() {
  if (!history.length) return;
  future.push(currentState());
  applyState(history.pop());
  updateHistoryButtons();
}

function redo() {
  if (!future.length) return;
  history.push(currentState());
  applyState(future.pop());
  updateHistoryButtons();
}

function setRatio(ratio, record = true) {
  const isVertical = ratio === "vertical";
  const alreadySet = stage.classList.contains("is-vertical") === isVertical;
  if (alreadySet) return;
  if (record) saveHistory();
  stage.classList.toggle("is-vertical", isVertical);
  document.querySelectorAll(".ratio-button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.ratio === ratio));
  });
}

function switchPanel(name) {
  const content = panelMarkup[name];
  if (!content) return;
  tabs.forEach((tab) => {
    const active = tab.dataset.panel === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  panel.setAttribute("aria-labelledby", `tab-${name}`);
  panelTitle.textContent = content.title;
  panelDescription.textContent = content.description;
  panelContent.innerHTML = content.html || `
    <div class="drop-zone" id="drop-zone">
      <div class="upload-icon" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 22 22" fill="none"><path d="M11 14V4m0 0L7.5 7.5M11 4l3.5 3.5M4.5 13.5v3A1.5 1.5 0 0 0 6 18h10a1.5 1.5 0 0 0 1.5-1.5v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg></div>
      <strong>Drop your stream here</strong><p>MP4, MOV or WebM · stored on this device</p>
      <button class="primary-button" id="choose-video" type="button">Choose a video</button>
      <input class="sr-only" id="video-file" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" />
    </div>
    <div class="section-label"><span>Your media</span><span id="media-count">0 items</span></div>
    <div class="media-card" id="media-card">
      <div class="media-thumb is-empty" id="media-thumb" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z" stroke="currentColor" /><path d="m10 8 5 4-5 4V8Z" fill="currentColor" /></svg></div>
      <div class="media-info"><strong id="media-name">No video yet</strong><span id="media-size">Upload a clip to begin</span></div>
      <button class="icon-button media-remove" id="remove-video" type="button" aria-label="Remove video" title="Remove video" hidden><svg width="15" height="15" viewBox="0 0 18 18" fill="none"><path d="m5 5 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></button>
    </div>
    <p class="panel-note">Your video stays right here in your browser. It isn't uploaded to a server.</p>`;
  if (content.html) return;
  syncMediaPanel();
  attachDropZone();
}

function syncMediaPanel() {
  const mediaName = document.querySelector("#media-name");
  if (!mediaName) return;
  const hasVideo = Boolean(video.src);
  mediaName.textContent = hasVideo ? activeFile?.name || "Stream clip" : "No video yet";
  document.querySelector("#media-size").textContent = hasVideo
    ? `${humanSize(activeFile?.size || 0)} · local video`
    : "Upload a clip to begin";
  document.querySelector("#media-count").textContent = hasVideo ? "1 item" : "0 items";
  document.querySelector("#media-thumb").classList.toggle("is-empty", !hasVideo);
  document.querySelector("#remove-video").hidden = !hasVideo;
  if (hasVideo) {
    document.querySelector("#media-thumb").innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" fill="currentColor" /></svg>';
  }
}

function humanSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachDropZone() {
  const zone = document.querySelector("#drop-zone");
  const choose = document.querySelector("#choose-video");
  const input = document.querySelector("#video-file");
  if (!zone || !choose || !input) return;
  choose.addEventListener("click", () => input.click());
  input.addEventListener("change", () => loadVideo(input.files[0]));
  ["dragenter", "dragover"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
  }));
  zone.addEventListener("drop", (event) => loadVideo(event.dataTransfer.files[0]));
}

function loadVideo(file) {
  if (!file) return;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["mp4", "mov", "webm"].includes(extension)) {
    showToast("Choose a video file in MP4, MOV or WebM format.");
    return;
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  activeFile = file;
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.hidden = false;
  stage.classList.add("has-video");
  document.querySelector("#clip-title").textContent = file.name;
  syncMediaPanel();
  showToast("Video ready. It's stored locally in this browser.");
}

function removeVideo() {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.hidden = true;
  stage.classList.remove("has-video");
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  activeFile = null;
  document.querySelector("#video-file").value = "";
  trimStart = 0;
  trimEnd = 0;
  splitAt = null;
  syncMediaPanel();
  renderTimeline();
}

function updateTime() {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  timeDisplay.textContent = formatTime(current);
  durationDisplay.textContent = formatTime(duration);
  timelineDuration.textContent = formatTime(duration);
  if (duration > 0) {
    const pct = Math.min(100, (current / duration) * 100);
    playhead.style.left = `${pct}%`;
  }
  if (!video.paused && trimEnd > trimStart && current >= trimEnd) {
    video.pause();
    video.currentTime = trimEnd;
  }
}

function renderTimeline() {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const start = duration ? trimStart / duration * 100 : 0;
  const end = duration ? trimEnd / duration * 100 : 72;
  clip.style.left = `${start}%`;
  clip.style.width = `${Math.max(0, end - start)}%`;
  clip.classList.toggle("is-trimmed", start > 0 || (duration && end < 100));
  document.querySelector("#trim-button").disabled = !duration;
  document.querySelector("#split-button").disabled = !duration;
  document.querySelector("#trim-start").setAttribute("aria-valuenow", String(Math.round(start)));
  document.querySelector("#trim-end").setAttribute("aria-valuenow", String(Math.round(end)));
  document.querySelector("#trim-start").setAttribute("aria-valuemin", "0");
  document.querySelector("#trim-start").setAttribute("aria-valuemax", String(Math.round(end)));
  document.querySelector("#trim-end").setAttribute("aria-valuemin", String(Math.round(start)));
  document.querySelector("#trim-end").setAttribute("aria-valuemax", "100");
  const ruler = document.querySelector("#time-ruler");
  ruler.replaceChildren(...Array.from({ length: 6 }, (_, index) => {
    const tick = document.createElement("span");
    tick.className = "ruler-tick";
    tick.style.left = `${index * 20}%`;
    tick.textContent = formatTime(duration * index / 5);
    return tick;
  }));
  const existingSplit = document.querySelector("#split-marker");
  if (existingSplit) existingSplit.remove();
  if (splitAt !== null && duration > 0) {
    const marker = document.createElement("span");
    marker.id = "split-marker";
    marker.setAttribute("aria-label", `Split at ${formatTime(splitAt)}`);
    marker.style.cssText = `position:absolute;z-index:2;top:6px;bottom:6px;left:${splitAt / duration * 100}%;width:2px;background:#ff886d;pointer-events:none`;
    document.querySelector("#video-track").append(marker);
  }
  const overlay = document.querySelector("#overlay-clip");
  overlay.style.left = duration ? `${start}%` : "12%";
  overlay.style.width = duration ? `${Math.max(8, end - start)}%` : "24%";
  document.querySelector("#overlay-clip").textContent = captionsAdded ? "CC  Captions" : "Aa  insane clutch";
}

function seekFromPointer(event) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) return;
  const rect = document.querySelector("#track-content").getBoundingClientRect();
  const position = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  video.currentTime = position * duration;
  updateTime();
}

function beginTrim(event, side) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) return;
  event.preventDefault();
  event.stopPropagation();
  saveHistory();
  const rect = document.querySelector("#track-content").getBoundingClientRect();
  const update = (pointerEvent) => {
    const point = Math.min(1, Math.max(0, (pointerEvent.clientX - rect.left) / rect.width));
    const time = point * duration;
    const minGap = Math.min(0.25, duration / 100);
    if (side === "start") trimStart = Math.min(time, trimEnd - minGap);
    else trimEnd = Math.max(time, trimStart + minGap);
    trimStart = Math.max(0, trimStart);
    trimEnd = Math.min(duration, trimEnd);
    renderTimeline();
    if (side === "start" && video.currentTime < trimStart) video.currentTime = trimStart;
    if (side === "end" && video.currentTime > trimEnd) video.currentTime = trimEnd;
  };
  const finish = () => {
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", finish);
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", finish, { once: true });
}

function selectOverlay(element, label) {
  selectedOverlay = element;
  titleOverlay.classList.toggle("is-selected", element === titleOverlay);
  facecamOverlay.classList.toggle("is-selected", element === facecamOverlay);
  document.querySelector("#inspector-name").textContent = label;
  document.querySelector("#overlay-text-row").hidden = element !== titleOverlay;
  document.querySelector("#overlay-copy").value = titleText;
  document.querySelector("#overlay-size").value = String(Math.round(
    element === facecamOverlay ? facecamScale : titleScale,
  ));
  inspector.classList.add("is-visible");
}

function dragOverlay(event, element, kind) {
  event.preventDefault();
  const stageRect = stage.getBoundingClientRect();
  const overlayRect = element.getBoundingClientRect();
  const offsetX = event.clientX - overlayRect.left;
  const offsetY = event.clientY - overlayRect.top;
  selectOverlay(element, kind === "title" ? "Text overlay" : "Facecam frame");
  saveHistory();

  const move = (pointerEvent) => {
    const left = Math.min(stageRect.width - overlayRect.width, Math.max(0, pointerEvent.clientX - stageRect.left - offsetX));
    const top = Math.min(stageRect.height - overlayRect.height, Math.max(0, pointerEvent.clientY - stageRect.top - offsetY));
    const position = {
      x: left / stageRect.width * 100,
      y: top / stageRect.height * 100,
    };
    if (kind === "title") titlePosition = position;
    else facecamPosition = position;
    element.style.left = `${position.x}%`;
    element.style.top = `${position.y}%`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  };
  const finish = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
}

function resizeOverlay(event, kind) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startScale = kind === "facecam" ? facecamScale : titleScale;
  const width = stage.getBoundingClientRect().width;
  saveHistory();
  const move = (pointerEvent) => {
    const change = ((pointerEvent.clientX - startX) / width) * 100;
    const scale = Math.min(140, Math.max(70, startScale + change));
    if (kind === "facecam") {
      facecamScale = scale;
      facecamOverlay.style.width = `${18 * facecamScale / 100}%`;
    } else {
      titleScale = scale;
      titleOverlay.style.fontSize = `calc(clamp(14px, 1.8vw, 23px) * ${titleScale / 100})`;
    }
    document.querySelector("#overlay-size").value = String(Math.round(scale));
  };
  const finish = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
}

function renderExtraSticker() {
  let sticker = document.querySelector("#extra-sticker");
  if (!extraSticker) {
    sticker?.remove();
    return;
  }
  if (!sticker) {
    sticker = document.createElement("div");
    sticker.id = "extra-sticker";
    sticker.style.cssText = "position:absolute;z-index:3;top:45%;left:62%;padding:8px 11px;border:1px solid rgb(255 255 255 / 45%);border-radius:999px;background:#fff;color:#6b4bd4;font-size:15px;font-weight:800;box-shadow:0 3px 12px rgb(0 0 0 / 22%);";
    stage.append(sticker);
  }
  sticker.textContent = extraSticker;
}

function renderCaptions() {
  let caption = document.querySelector("#caption-overlay");
  if (!captionsAdded) {
    caption?.remove();
    return;
  }
  if (!caption) {
    caption = document.createElement("div");
    caption.id = "caption-overlay";
    caption.style.cssText = "position:absolute;z-index:3;bottom:20%;left:50%;max-width:85%;padding:7px 12px;border-radius:6px;background:rgb(20 21 32 / 78%);color:white;font-size:clamp(11px,1.3vw,17px);font-weight:750;text-align:center;text-shadow:0 1px 5px #000;transform:translateX(-50%);";
    stage.append(caption);
  }
  caption.textContent = video.currentTime > 0 ? "what a play!" : "your highlight goes here";
}

function addTextOverlay() {
  saveHistory();
  titleText = "Your highlight";
  titleCopy.textContent = titleText;
  titleOverlay.setAttribute("aria-label", "Text overlay: Your highlight. Select to adjust.");
  selectOverlay(titleOverlay, "Text overlay");
  showToast("Text overlay added. Drag it to position.");
}

function performPanelAction(target) {
  const action = target.dataset.action;
  if (action === "add-captions") {
    saveHistory();
    captionsAdded = true;
    renderCaptions();
    renderTimeline();
    showToast("Caption placeholder added to your preview.");
  } else if (action === "caption-style") {
    showToast("Bold highlight style selected.");
  } else if (action === "sticker") {
    saveHistory();
    extraSticker = target.dataset.value;
    renderExtraSticker();
    showToast("Sticker added to your preview.");
  } else if (action === "add-facecam") {
    facecamOverlay.hidden = false;
    selectOverlay(facecamOverlay, "Facecam frame");
    showToast("Facecam frame added to your preview.");
  } else if (action === "add-text") {
    addTextOverlay();
  }
}

tabs.forEach((tab) => tab.addEventListener("click", () => switchPanel(tab.dataset.panel)));
document.querySelector(".sidebar").addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const selected = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  const direction = event.key === "ArrowDown" ? 1 : -1;
  tabs[(selected + direction + tabs.length) % tabs.length].focus();
});
panelContent.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.ratio) {
    setRatio(target.dataset.ratio);
    document.querySelectorAll(".ratio-button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.ratio === target.dataset.ratio));
    });
    showToast(`${target.dataset.ratio === "vertical" ? "Vertical 9:16" : "Landscape 16:9"} layout selected.`);
    return;
  }
  if (target.dataset.action) performPanelAction(target);
});
attachDropZone();

document.querySelectorAll(".ratio-button").forEach((button) => {
  button.addEventListener("click", () => setRatio(button.dataset.ratio));
});
document.querySelector("#remove-video").addEventListener("click", removeVideo);
document.querySelector("#undo-button").addEventListener("click", undo);
document.querySelector("#redo-button").addEventListener("click", redo);
document.querySelector("#export-button").addEventListener("click", () => {
  showToast(video.src
    ? "Export isn't available in this preview yet. Your edits are still in this browser."
    : "Upload a stream recording first. Export is coming in a future step.");
});
document.querySelector("#help-button").addEventListener("click", () => {
  showToast("Your local-first clip editor preview. Upload a video, choose a layout, and arrange overlays.");
});
document.querySelector("#fit-button").addEventListener("click", () => {
  stage.animate([{ transform: "scale(.98)" }, { transform: "scale(1)" }], { duration: 180 });
});
document.querySelector("#close-inspector").addEventListener("click", () => {
  inspector.classList.remove("is-visible");
  titleOverlay.classList.remove("is-selected");
  facecamOverlay.classList.remove("is-selected");
  selectedOverlay = null;
});
document.querySelector("#overlay-size").addEventListener("pointerdown", saveHistory);
document.querySelector("#overlay-size").addEventListener("input", (event) => {
  const scale = Number(event.target.value);
  if (selectedOverlay === facecamOverlay) {
    facecamScale = scale;
    facecamOverlay.style.width = `${18 * facecamScale / 100}%`;
  } else {
    titleScale = scale;
    titleOverlay.style.fontSize = `calc(clamp(14px, 1.8vw, 23px) * ${titleScale / 100})`;
  }
});
document.querySelector("#overlay-copy").addEventListener("focus", saveHistory);
document.querySelector("#overlay-copy").addEventListener("input", (event) => {
  titleText = event.target.value;
  titleCopy.textContent = titleText;
  titleOverlay.setAttribute("aria-label", `Text overlay: ${titleText}. Select to adjust.`);
});
projectName.addEventListener("input", () => {
  projectStatus.textContent = "Editing";
});
projectName.addEventListener("change", () => {
  projectStatus.textContent = "In this tab";
});
document.querySelector("#play-button").addEventListener("click", async () => {
  if (!video.src) {
    showToast("Upload a video to preview playback.");
    return;
  }
  try {
    if (video.paused) await video.play();
    else video.pause();
  } catch (error) {
    showToast(`Couldn't play this video: ${error.message}`);
  }
});
video.addEventListener("loadedmetadata", () => {
  trimStart = 0;
  trimEnd = video.duration;
  updateTime();
  renderTimeline();
  syncMediaPanel();
});
video.addEventListener("error", () => {
  if (video.src) showToast("This video couldn't be previewed. Try an MP4, MOV or WebM file supported by your browser.");
});
video.addEventListener("timeupdate", () => {
  updateTime();
  renderCaptions();
});
video.addEventListener("play", () => {
  document.querySelector("#play-button").classList.add("is-playing");
  document.querySelector("#play-button").setAttribute("aria-label", "Pause preview");
});
video.addEventListener("pause", () => {
  document.querySelector("#play-button").classList.remove("is-playing");
  document.querySelector("#play-button").setAttribute("aria-label", "Play preview");
});
document.querySelector("#skip-back-button").addEventListener("click", () => {
  video.currentTime = trimStart;
  updateTime();
});
document.querySelector("#volume-control").addEventListener("input", (event) => {
  video.volume = Number(event.target.value);
});
document.querySelector("#trim-button").addEventListener("click", () => {
  if (!video.duration) {
    showToast("Upload a video to trim the timeline.");
    return;
  }
  if (trimStart === 0 && trimEnd === video.duration) {
    saveHistory();
    trimStart = video.duration * 0.1;
    trimEnd = video.duration * 0.9;
  } else {
    saveHistory();
    trimStart = 0;
    trimEnd = video.duration;
  }
  video.currentTime = trimStart;
  renderTimeline();
  updateTime();
});
document.querySelector("#split-button").addEventListener("click", () => {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) {
    showToast("Upload a video before splitting a clip.");
    return;
  }
  const point = video.currentTime;
  if (point <= trimStart + 0.1 || point >= trimEnd - 0.1) {
    showToast("Move the playhead inside the clip to split it.");
    return;
  }
  saveHistory();
  splitAt = point;
  renderTimeline();
  showToast(`Clip split at ${formatTime(point)}.`);
});
document.querySelector("#trim-start").addEventListener("pointerdown", (event) => beginTrim(event, "start"));
document.querySelector("#trim-end").addEventListener("pointerdown", (event) => beginTrim(event, "end"));
["start", "end"].forEach((side) => {
  document.querySelector(`#trim-${side}`).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) return;
    saveHistory();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
    const step = Math.max(0.25, duration / 100);
    if (side === "start") trimStart = Math.max(0, Math.min(trimEnd - step, trimStart + direction * step));
    else trimEnd = Math.min(duration, Math.max(trimStart + step, trimEnd + direction * step));
    if (side === "start" && video.currentTime < trimStart) video.currentTime = trimStart;
    if (side === "end" && video.currentTime > trimEnd) video.currentTime = trimEnd;
    renderTimeline();
  });
});
document.querySelector("#track-content").addEventListener("pointerdown", (event) => {
  if (event.target.closest(".trim-handle")) return;
  if (event.target.closest(".clip-block")) {
    seekFromPointer(event);
    return;
  }
  if (event.target.closest(".track-row, .time-ruler")) seekFromPointer(event);
});
titleOverlay.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".resize-handle")) resizeOverlay(event, "title");
  else dragOverlay(event, titleOverlay, "title");
});
facecamOverlay.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".resize-handle")) resizeOverlay(event, "facecam");
  else dragOverlay(event, facecamOverlay, "facecam");
});
titleOverlay.addEventListener("click", () => selectOverlay(titleOverlay, "Text overlay"));
facecamOverlay.addEventListener("click", () => selectOverlay(facecamOverlay, "Facecam frame"));
titleOverlay.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") selectOverlay(titleOverlay, "Text overlay");
});
facecamOverlay.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") selectOverlay(facecamOverlay, "Facecam frame");
});
document.querySelector("#zoom-in").addEventListener("click", () => {
  zoom = Math.min(200, zoom + 25);
  document.querySelector("#zoom-label").textContent = `${zoom}%`;
  document.querySelector("#track-content").style.minWidth = `${640 * zoom / 100}px`;
});
document.querySelector("#zoom-out").addEventListener("click", () => {
  zoom = Math.max(50, zoom - 25);
  document.querySelector("#zoom-label").textContent = `${zoom}%`;
  document.querySelector("#track-content").style.minWidth = `${640 * zoom / 100}px`;
});

window.addEventListener("beforeunload", () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

updateHistoryButtons();
renderTimeline();
