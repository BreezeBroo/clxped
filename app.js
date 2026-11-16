const form = document.querySelector("#analyze-form");
const input = document.querySelector("#video-url");
const formMessage = document.querySelector("#form-message");
const analyzeButton = document.querySelector("#analyze-button");
const sampleButton = document.querySelector("#sample-button");
const toast = document.querySelector("#toast");
const peakRows = [...document.querySelectorAll(".peak-row")];

const sampleUrl = "https://www.youtube.com/watch?v=clxped-demo";
let toastTimeout;

function isSupportedReplay(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.length > 1;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      return Boolean(url.searchParams.get("v")) || /^\/(live|shorts|embed)\/[^/]+/.test(url.pathname);
    }

    if (host === "twitch.tv") {
      return /^\/[^/]+\/videos\/\d+/.test(url.pathname);
    }

    return false;
  } catch {
    return false;
  }
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

function runDemo(url) {
  if (!isSupportedReplay(url)) {
    setFormMessage("Enter a YouTube video or Twitch VOD link to continue.", true);
    input.focus();
    return;
  }

  setFormMessage("Loading sample results…");
  analyzeButton.disabled = true;
  analyzeButton.querySelector("span:first-child").textContent = "Analyzing...";

  window.setTimeout(() => {
    analyzeButton.disabled = false;
    analyzeButton.querySelector("span:first-child").textContent = "Analyze replay";
    setFormMessage("Demo preview loaded — these peaks are illustrative, not from your link.");
    document.querySelector("#moments").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Demo preview only: live replay analysis needs a configured platform data connection.");
  }, 650);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runDemo(input.value.trim());
});

sampleButton.addEventListener("click", () => {
  input.value = sampleUrl;
  runDemo(sampleUrl);
});

peakRows.forEach((row) => {
  row.addEventListener("click", () => {
    peakRows.forEach((peak) => {
      const selected = peak === row;
      peak.classList.toggle("is-selected", selected);
      peak.setAttribute("aria-pressed", String(selected));
    });

    showToast(`Sample moment at ${row.dataset.time} selected. Connect a platform data source to jump to the real replay.`);
  });
});
