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

test("server-renders the live world-model laboratory", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Live World Model Lab \| UTMIST Research<\/title>/i);
  assert.match(html, /Learn the dynamics/);
  assert.match(html, /Train world model/);
  assert.match(html, /Two-corridor navigation task/);
  assert.match(html, /Weights train from random initialization/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("ships the model implementation, research prompts, and social asset", async () => {
  const [page, model, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/world-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.match(page, /trainEnsemble/);
  assert.match(page, /planWithModel/);
  assert.match(page, /From grids to pixels/);
  assert.match(model, /class TinyWorldModel/);
  assert.match(model, /adaptOnSurprise/);
  assert.match(layout, /summary_large_image/);
  assert.match(css, /prefers-reduced-motion/);
});
