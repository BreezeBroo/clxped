const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createAppServer } = require("../server");

const server = createAppServer();
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("serves the editor shell and static assets", async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /Clip Studio/);

  const stylesheet = await fetch(`${baseUrl}/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type"), /text\/css/);
  assert.match(await stylesheet.text(), /--brand: #6959e8/);

  const script = await fetch(`${baseUrl}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
});

test("restricts requests to allowlisted editor assets", async () => {
  const backend = await fetch(`${baseUrl}/server.js`);
  assert.equal(backend.status, 404);

  const oldApi = await fetch(`${baseUrl}/api/analyze`);
  assert.equal(oldApi.status, 404);

  const method = await fetch(baseUrl, { method: "POST" });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET, HEAD");

  const head = await fetch(baseUrl, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
