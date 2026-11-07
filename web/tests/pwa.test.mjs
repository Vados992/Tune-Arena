import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { detectInstallPlatform, installAction } from "../lib/install-platform.mjs";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker(network = async () => new Response("live account page")) {
  const events = {}, deleted = [], precached = [];
  const self = { location: { origin: "https://arena.example" }, addEventListener: (name, callback) => { events[name] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const caches = {
    open: async () => ({ addAll: async urls => { precached.push(...urls); } }),
    keys: async () => ["tune-arena-public-shell-v0", "tune-arena-public-shell-v1", "another-app-cache"],
    delete: async key => { deleted.push(key); },
    match: async path => path === "/offline.html" ? new Response("public offline help") : undefined,
    put: () => { throw new Error("Personalized responses must never be cached"); },
  };
  vm.runInNewContext(source, { self, caches, fetch: network, URL, Response });
  function request(path, method = "GET", mode = "navigate") {
    let response;
    events.fetch({ request: { url: new URL(path, self.location.origin).href, method, mode }, respondWith: value => { response = value; } });
    return response;
  }
  return { events, request, precached, deleted };
}

test("install manifest has usable same-origin icons and standalone scope", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.scope, "/"); assert.equal(manifest.start_url, "/"); assert.equal(manifest.display, "standalone");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`);
    assert.ok(icon); assert.match(icon.src, /^\/icons\//);
    const png = readFileSync(new URL("../public" + icon.src, import.meta.url));
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
});
test("offline worker precaches public assets only and preserves other apps' caches", async () => {
  const w = worker(); let task;
  w.events.install({ waitUntil: p => { task = p; } }); await task;
  assert.equal(w.precached.length, 4);
  assert.ok(w.precached.every(path => path === "/offline.html" || path.startsWith("/icons/")));
  w.events.activate({ waitUntil: p => { task = p; } }); await task;
  assert.deepEqual(w.deleted, ["tune-arena-public-shell-v0"]);
});
test("API, admin, auth, confirmation, non-GET and cross-origin requests bypass offline handling", () => {
  const w = worker();
  for (const path of ["/api/state", "/api/admin/rounds", "/admin", "/signin-with-chatgpt", "/callback", "/api/auth/email/callback?token=secret", "/?confirm=secret", "/?code=secret", "/?state=secret", "/?token=secret", "https://outside.example/"]) assert.equal(w.request(path), undefined, path);
  assert.equal(w.request("/", "POST"), undefined);
  assert.equal(w.request("/api/state", "GET", "cors"), undefined);
});
test("live pages always use network; offline public navigation gets static help", async () => {
  const live = worker();
  assert.equal(await (await live.request("/")).text(), "live account page");
  const offline = worker(async () => { throw new Error("network unavailable"); });
  for (const path of ["/", "/install", "/winners"]) assert.equal(await (await offline.request(path)).text(), "public offline help");
});

test("iPhone Safari, embedded iPhone browsers and iPad desktop mode get iOS instructions", () => {
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 Version/27.2 Mobile/15E148 Safari/604.1";
  const embedded = "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 ChatGPT";
  const chrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 CriOS/145.0.0.0 Mobile/15E148 Safari/604.1";
  for (const ua of [safari, embedded, chrome]) assert.equal(detectInstallPlatform(ua), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15", 5), "ios");
});
test("desktop Mac/Windows and Android are not mistaken for iPhone", () => {
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/27 Safari/605.1.15", 0), "desktop");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/145 Safari/537.36", 0), "desktop");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Linux; Android 16) Chrome/145 Mobile Safari/537.36", 5), "android");
});
test("unsupported install buttons always open a guide; iOS never invokes a programmatic prompt", () => {
  for (const platform of ["ios", "android", "desktop"]) assert.equal(installAction(platform, false), "guide");
  assert.equal(installAction("ios", true), "guide");
  assert.equal(installAction("android", true), "prompt");
  assert.equal(installAction("desktop", true), "prompt");
});
