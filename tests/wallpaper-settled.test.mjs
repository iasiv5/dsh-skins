/**
 * Tri-state unit tests for the wallpaper-settled helper (ADR-0023 Task 7).
 *
 * The helper runs its probes through page.evaluate; the stub "page" here
 * simply executes those callbacks against Node globals (getComputedStyle /
 * document / Image stubs), so all three contract states are falsifiable
 * offline — no live host, no browser: the pipeline gates default to the
 * openbmc skin (inline art, B9) and SKIP without a live host, so the wait
 * logic must be provable without them.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { awaitWallpaperSettled } from "../scripts/lib/wallpaper-settled.mjs";

const EXTERNAL = 'url("/dsh-skins/assets/b_meirenzhi_yuntai.webp?v=1.5.22")';
const INLINE = 'url("data:image/webp;base64,AAAA")';

function withBrowserGlobals({ backgroundImage, image }) {
  const previous = {
    getComputedStyle: globalThis.getComputedStyle,
    document: globalThis.document,
    Image: globalThis.Image,
  };
  globalThis.getComputedStyle = () => ({ backgroundImage });
  globalThis.document = { body: {} };
  if (image !== undefined) globalThis.Image = image;
  return () => {
    globalThis.getComputedStyle = previous.getComputedStyle;
    globalThis.document = previous.document;
    globalThis.Image = previous.Image;
  };
}

function stubPage() {
  return { evaluate: (fn, arg) => Promise.resolve(fn(arg)) };
}

test("external route URL: waits for the Image onload settle and logs the wait", async () => {
  const restore = withBrowserGlobals({
    backgroundImage: EXTERNAL,
    image: class {
      set src(value) {
        assert.equal(value, "/dsh-skins/assets/b_meirenzhi_yuntai.webp?v=1.5.22");
        queueMicrotask(() => this.onload());
      }
    },
  });
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(line);
  try {
    await awaitWallpaperSettled(stubPage(), { timeoutMs: 1000 });
  } finally {
    console.log = originalLog;
    restore();
  }
  assert.equal(logs.filter((line) => /^wallpaper settled in \d+ms$/.test(line)).length, 1, "must log exactly one settled line");
});

test("inline data URL or no wallpaper: resolves immediately without touching Image", async () => {
  for (const backgroundImage of [INLINE, "none"]) {
    let imageConstructed = false;
    const restore = withBrowserGlobals({
      backgroundImage,
      image: class {
        constructor() { imageConstructed = true; }
      },
    });
    try {
      await awaitWallpaperSettled(stubPage(), { timeoutMs: 1000 });
    } finally {
      restore();
    }
    assert.equal(imageConstructed, false, `no Image for ${backgroundImage}`);
  }
});

test("hung fetch: throws WALLPAPER_SETTLED_TIMEOUT after the deadline", async () => {
  const restore = withBrowserGlobals({
    backgroundImage: EXTERNAL,
    image: class {
      set src(_value) { /* never resolves: neither onload nor onerror fires */ }
    },
  });
  try {
    await assert.rejects(
      awaitWallpaperSettled(stubPage(), { timeoutMs: 50 }),
      (error) => error instanceof Error && error.message.includes("WALLPAPER_SETTLED_TIMEOUT"),
    );
  } finally {
    restore();
  }
});
