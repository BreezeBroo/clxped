const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const ROOT = __dirname;
const STATIC_FILES = new Set(["app.js", "favicon.svg", "index.html", "styles.css"]);
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const fileName = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (!STATIC_FILES.has(fileName)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const file = path.join(ROOT, fileName);
  readFile(file).then((content) => {
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(file)],
      "x-content-type-options": "nosniff",
      "cache-control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  }).catch((error) => {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    console.error("Static file read failed:", error);
    response.writeHead(500);
    response.end("Unable to read file");
  });
}

function createAppServer() {
  return createServer(serveStatic);
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  createAppServer().listen(port, host, () => {
    console.log(`Clip Studio is running at http://${host}:${port}`);
  });
}

module.exports = { createAppServer };
