import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the campus memory experiment", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Changing-World Campus Agent \| UTMIST Research<\/title>/i);
  assert.match(html, /Can an AI remember a world/);
  assert.match(html, /Begin traversal/);
  assert.match(html, /Deerfield Hall/);
  assert.match(html, /Evidence, not guesses/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("ships the experiment content and social asset", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(page, /Open-world spatial grounding/);
  assert.match(page, /Contradiction-aware memory/);
  assert.match(page, /Calibrated active perception/);
  assert.match(page, /ArrowRight/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(layout, /x-forwarded-host/);
  assert.match(layout, /summary_large_image/);
});
