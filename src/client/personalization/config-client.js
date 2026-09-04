/**
 * Config client — the browser-side state machine for personalization
 * (design §7.1, write-through auto-save per ADR-0003). Four states:
 *
 *   loading               initial fetch in flight (writes forbidden)
 *   synced                snapshot in hand; 保存 (flushNow) allowed
 *   offline-failed        fetch failed/timed out; retry offered; writes forbidden
 *   unsupported-readonly  Host runs a newer configVersion; view-only
 *
 * ADR-0003 (v2.5) — write-through auto-save: edits live in the preview
 * layer, project locally in real time, and persist automatically via a
 * 400ms debounce (one PATCH per quiet window). No save action exists.
 * Guards (all covered by tests):
 *   - fetch arrives after the user already switched skins → applied anyway
 *     (config is orthogonal to skin selection), but late responses after
 *     dispose() are dropped via the sequence counter;
 *   - dirty preview fields are never overwritten by a late fetch (R3);
 *   - writes are serialized in order; a stale write response cannot roll a
 *     newer local state back (sequence checked before applying results);
 *   - a REVISION_CONFLICT 409 refetches and retries once only when a newer
 *     normal snapshot lands; failed/unchanged refetches never blind-retry,
 *     and unchanged normal snapshots surface the conflict instead;
 *     STORE_READONLY downgrades to read-only with no refetch;
 *   - writes emit `dsh-skins:config-changed` + a BroadcastChannel ping so
 *     other tabs refetch; window focus refetch is the fallback path;
 *   - retry exhaustion or an unchanged normal refetch lands in lastFlushCode;
 *     ordinary failures land in the mutually exclusive lastFlushError;
 *   - every applied snapshot emits to local subscribers — including
 *     same-status refetches, whose silent swaps previously starved the UI.
 */

import { defaultsFor, isSameOverrideValue } from "../../shared/personalization/catalog.js";

const CHANNEL = "dsh-skins";
const FETCH_TIMEOUT_MS = 3000;
// Uploads carry up to 20MB bodies (the Host's GLOBAL_MAX_BYTES) over WAN
// upstreams, so the 3s config-fetch window must never govern them —
// AbortSignal.timeout is wall-clock from request start and would abort a
// multi-megabyte transfer mid-flight (field report: "稍微大一点的图片就上传
// 不上来"). Still a hard cap, not an idle timeout: a hung connection must
// release the panel's sequential batch loop instead of pinning it forever.
const UPLOAD_TIMEOUT_MS = 120_000;

function cloneSkins(skins) {
  return skins === undefined || skins === null ? {} : structuredClone(skins);
}

export function createConfigClient(options = {}) {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  const baseUrl = options.baseUrl ?? "/dsh-skins";
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const uploadTimeoutMs = options.uploadTimeoutMs ?? UPLOAD_TIMEOUT_MS;

  if (typeof fetchImpl !== "function") throw new Error("config client requires a fetch implementation");

  let status = "loading";
  let snapshot = { skins: {}, library: [], references: {}, revision: 0, mode: "normal" };
  const previews = new Map(); // `${skinId} ${key}` → value (dirty, unsaved)
  const listeners = new Set();
  let fetchGeneration = 0;
  let disposed = false;
  let writeChain = Promise.resolve();
  let lastFlushCode = null;
  let lastFlushError = null;
  let channel = null;

  function setFlushFailure(code, message) {
    lastFlushCode = code;
    lastFlushError = message;
  }

  // -- plumbing --------------------------------------------------------------

  function emit() {
    for (const listener of [...listeners]) {
      try { listener(publicState()); } catch {}
    }
  }

  function publicState() {
    return {
      status,
      revision: snapshot.revision,
      mode: snapshot.mode,
      skins: cloneSkins(snapshot.skins),
      library: snapshot.library,
      references: snapshot.references ?? {},
      recovery: snapshot.recovery,
      quota: snapshot.quota,
      lastFlushCode,
      lastFlushError,
      dirtyCount: previews.size,
    };
  }

  async function request(path, init = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      signal: init.signal ?? (typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined),
    });
    return response;
  }

  function setStatus(next) {
    if (status === next) return;
    status = next;
    emit();
  }

  // -- reads -----------------------------------------------------------------

  async function refetch() {
    if (disposed) return publicState();
    // Stale-response guards (design §7.1): only the newest fetch may land,
    // and a response arriving after a skin switch is dropped.
    const generation = ++fetchGeneration;
    const contextAtStart = options.contextActive?.();
    try {
      const response = await request("/config");
      if (disposed || generation !== fetchGeneration) return publicState();
      if (contextAtStart !== undefined && options.contextActive?.() !== contextAtStart) {
        void refetch(); // the world moved on — drop the stale snapshot and pull for the new one
        return publicState();
      }
      if (response.status === 404 || response.status === 501) {
        // Host older than the client (no personalization routes yet).
        setStatus("offline-failed");
        return publicState();
      }
      if (!response.ok) {
        setStatus("offline-failed");
        return publicState();
      }
      const body = await response.json();
      if (disposed || generation !== fetchGeneration) return publicState();
      if (contextAtStart !== undefined && options.contextActive?.() !== contextAtStart) {
        void refetch(); // pull a snapshot for the context that replaced this one
        return publicState();
      }
      if (body?.mode === "unsupported") {
        snapshot = { ...body, references: {} };
        setStatus("unsupported-readonly");
        emit(); // same-status swaps must still notify (field report: stale library grid)
        return publicState();
      }
      if (body?.mode === "recovery") {
        snapshot = { ...body };
        setStatus("synced"); // read-only until confirmed; panel offers recovery
        emit();
        return publicState();
      }
      snapshot = { ...body };
      setStatus("synced");
      // setStatus only emits on a status TRANSITION — an already-synced
      // refetch would otherwise swap the snapshot silently and starve every
      // subscriber (field report: deleted image kept showing in the grid).
      emit();
      return publicState();
    } catch {
      if (!disposed) setStatus("offline-failed");
      return publicState();
    }
  }

  // -- writes (serialized; gated by state machine) ---------------------------
  // ADR-0003 (v2.5): write-through auto-save. preview/previewReset arm a
  // 400ms debounce; the flush merges the window's edits into one PATCH and
  // retries a revision conflict once on the fresh baseRevision — no user
  // action anywhere. The client is a session-global singleton, so an
  // in-flight debounce completes regardless of the shell's lifecycle.

  const FLUSH_DEBOUNCE_MS = 400;
  let flushTimer = null;

  function gateWrites() {
    if (status === "synced") return null;
    if (status === "loading") return "loading";
    if (status === "unsupported-readonly") return "unsupported";
    return "offline";
  }

  function scheduleFlush() {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushNow();
    }, FLUSH_DEBOUNCE_MS);
  }

  function flushNow() {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (previews.size === 0) return Promise.resolve({ flushed: 0 });
    // Snapshot the dirty layer; previews captured here are the flush intent.
    const intent = [...previews.entries()];
    const buildOperations = () => intent.map(([composite, value]) => {
      const [skinId, key] = composite.split(" ");
      return value === null ? { op: "delete", skinId, key } : { op: "set", skinId, key, value };
    });
    const count = buildOperations().length;
    writeChain = writeChain.then(async () => {
      try {
        if (disposed) return { flushed: 0, blocked: "disposed" };
        const blocked = gateWrites();
        if (blocked !== null) return { flushed: 0, blocked };
        // ADR-0003: retry once only after a conflict refetch has actually
        // applied a newer normal-mode snapshot.
        const attemptedRevision = snapshot.revision;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await request("/config", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ baseRevision: snapshot.revision, operations: buildOperations() }),
          });
          if (disposed) return { flushed: 0 };
          if (response.status === 409) {
            const conflictBody = await response.json().catch(() => null);
            const code = conflictBody?.code;
            const errorMessage = conflictBody?.error ?? "HTTP 409";
            if (code === "STORE_READONLY") {
              setFlushFailure(null, null);
              setStatus("unsupported-readonly");
              return { flushed: 0, blocked: "conflict", errorMessage: conflictBody?.error ?? "" };
            }
            if (code === "REVISION_CONFLICT") {
              if (attempt === 1) {
                setFlushFailure("REVISION_CONFLICT", null);
                emit();
                return { flushed: 0, blocked: "conflict" };
              }
              const refreshed = await refetch();
              const mayRetry = refreshed.status === "synced"
                && refreshed.mode === "normal"
                && refreshed.revision !== attemptedRevision;
              if (mayRetry) continue;

              if (refreshed.mode === "recovery") {
                setFlushFailure(null, null);
                emit();
                return { flushed: 0, blocked: "recovery" };
              }
              if (refreshed.status === "offline-failed") {
                setFlushFailure(null, null);
                emit();
                return { flushed: 0, blocked: "offline" };
              }
              if (refreshed.status === "unsupported-readonly") {
                setFlushFailure(null, null);
                emit();
                return { flushed: 0, blocked: "unsupported" };
              }
              // Still synced+normal but no new revision landed: no other UI
              // state surfaces this, so ADR-0003 requires a visible conflict.
              setFlushFailure("REVISION_CONFLICT", null);
              emit();
              return { flushed: 0, blocked: "conflict" };
            }
            if (code === "STORE_RECOVERY_REQUIRED") {
              const refreshed = await refetch();
              if (refreshed.mode === "recovery") {
                setFlushFailure(null, null);
                emit();
                return { flushed: 0, blocked: "recovery" };
              }
              setFlushFailure(null, errorMessage);
              emit();
              return { flushed: 0, blocked: "error", errorMessage };
            }
            setFlushFailure(null, errorMessage);
            emit();
            return { flushed: 0, blocked: "error", errorMessage };
          }
          if (!response.ok) {
            // Keep the previews dirty so a later edit can retry — and NAME
            // the failure: a silent 400 reads as "did it save?" (field
            // report: the stale-host BAD_SHAPE stayed invisible for days).
            const errorBody = await response.json().catch(() => null);
            const errorMessage = errorBody?.error ?? `HTTP ${response.status}`;
            setFlushFailure(null, errorMessage);
            emit();
            return { flushed: 0, blocked: "error", errorMessage };
          }
          await response.json().catch(() => null); // drained; resync happens in refetch()
          // Clear only previews the user has not superseded during the flight.
          for (const [composite, value] of intent) {
            if (previews.get(composite) === value) previews.delete(composite);
          }
          setFlushFailure(null, null);
          // Resync from the Host rather than trusting a racing local snapshot:
          // a refetch issued mid-flight may otherwise resurrect pre-write state.
          await refetch();
          announce();
          return { flushed: count };
        }
        return { flushed: 0, blocked: "conflict" };
      } catch {
        // The chain itself must stay fulfilled: one network failure may
        // never poison subsequent flushes (previews stay dirty for retry).
        setFlushFailure(null, null);
        emit();
        return { flushed: 0, blocked: "error" };
      }
    });
    return writeChain;
  }

  function announce() {
    try {
      if (typeof window !== "undefined" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("dsh-skins:config-changed"));
      }
    } catch {}
    try {
      if (channel === null && typeof BroadcastChannel === "function") channel = new BroadcastChannel(CHANNEL);
      channel?.postMessage({ kind: "config-changed" });
    } catch {}
  }

  // -- public API ------------------------------------------------------------

  /** Record a local edit, project it immediately, and arm ADR-0003 auto-save. */
  function preview(skinId, key, value) {
    // A value equal to the field's factory default is NOT an override
    // (v1.0.0 ruling — field report: clicking the default wallpaper thumb
    // made 恢复默认 appear and persisted a default-equal entry):
    //   pristine field  + default value → plain no-op (it already shows it);
    //   modified field  + default value → arm a delete op ("back to factory
    //                                     for this field");
    //   identical re-click on the effective value → idempotent no-op.
    // The client snapshot holds overrides only, so "pristine" means the key
    // is absent from both the stored section and the preview layer.
    const composite = `${skinId} ${key}`;
    const storedOverride = snapshot.skins[skinId]?.[key];
    const previewed = previews.get(composite);
    // Structural comparison for the same reason as the store's load-time
    // normalization: locale/colorScheme defaults are fresh objects per
    // defaultsFor() call, so `===` never fires for them.
    if (isSameOverrideValue(value, defaultsFor(skinId)[key])) {
      if (storedOverride === undefined && previewed === undefined) return;
      if (previewed === null) return; // delete op already armed
      return previewReset(skinId, key);
    }
    if (effectiveOverrides(skinId)[key] === value) return;
    previews.set(composite, value);
    setFlushFailure(null, null); // a fresh edit always clears the failure strip
    scheduleFlush();
    emit();
  }

  /** Record an unsaved reset-to-default (a delete op) for the field. */
  function previewReset(skinId, key) {
    previews.set(`${skinId} ${key}`, null);
    setFlushFailure(null, null);
    scheduleFlush();
    emit();
  }

  function effectiveOverrides(skinId) {
    const merged = cloneSkins(snapshot.skins[skinId] ?? {});
    for (const [composite, value] of previews) {
      const [owner, key] = composite.split(" ");
      if (owner !== skinId) continue;
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    return merged;
  }

  function retry() {
    if (status !== "offline-failed" && status !== "synced") return refetch();
    return refetch();
  }

  // -- asset operations (library management for the panel) -------------------

  /** SHA-256 hex of the bytes, when the platform provides WebCrypto. */
  async function assetFingerprint(bytes) {
    if (typeof crypto?.subtle?.digest !== "function") return null;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * One POST /library attempt. The signal is created per attempt (a
   * TimeoutError from the previous attempt's signal must not poison the
   * retry); everything else about the request is identical.
   */
  function attemptUpload(bytes, file, displayName) {
    // Own controller + timer instead of AbortSignal.timeout(): the built-in
    // helper's timer is unref'd in Node, so a hung fetch would NOT keep the
    // event loop alive (CI, Node 22: the upload tests drained the loop and
    // the runner cancelled everything after them), and a 120s timer would
    // linger per upload. Clearing it in `finally` keeps the wall-clock cap
    // (see UPLOAD_TIMEOUT_MS) while leaving no stray handle behind.
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller === null ? null
      : setTimeout(() => controller.abort(), uploadTimeoutMs);
    return request("/library", {
      method: "POST",
      signal: controller === null ? undefined : controller.signal,
      headers: {
        "content-type": typeof file?.type === "string" && file.type !== "" ? file.type : "application/octet-stream",
        "x-filename": encodeURIComponent(displayName ?? file?.name ?? "wallpaper"),
      },
      body: bytes,
    }).finally(() => {
      if (timer !== null) clearTimeout(timer);
    });
  }

  /**
   * Interpret one attempt's outcome. Returns `{ asset }` / `{ error }` on a
   * concluded answer, or `null` when the failure is connection-level (fetch
   * rejected, or the harness webserver's bare empty-400 on a broken request
   * stream — a stale keep-alive socket between the reverse-proxy chain and
   * node) and MAY be retried. Field report: 2 of 12 batch uploads died this
   * way mid-batch while their siblings succeeded; a single retry heals it.
   */
  async function interpretAttempt(response, networkError) {
    if (networkError !== undefined) {
      const timedOut = networkError?.name === "TimeoutError" || networkError?.name === "AbortError";
      // A rejected fetch surfaces as a panel message, never as an unhandled
      // rejection (field report: aborted uploads escaped both panel call
      // sites uncaught, so oversized images failed without any feedback).
      return timedOut ? { error: "UPLOAD_TIMEOUT" } : null; // null → retryable
    }
    if (response.ok) return { kind: "ok", response };
    const body = await response.json().catch(() => null);
    // A Host-coded error is a concluded answer (the upload reached the store).
    if (body?.code) return { error: body.code };
    // An edge proxy (nginx client_max_body_size) rejects oversized bodies
    // with an HTML 413 that carries no Host error code — normalize it to
    // UPLOAD_TOO_LARGE so the panel names the real cause.
    if (response.status === 413) return { error: "UPLOAD_TOO_LARGE" };
    // Bare 400 (empty body, no code) = the harness webserver's stream-error
    // reply: connection-level, retryable. Anything else unmapped stands.
    if (response.status === 400) return null; // null → retryable
    return { error: `HTTP ${response.status}` };
  }

  async function uploadImage(file, displayName) {
    const blocked = gateWrites();
    if (blocked !== null) return { error: blocked };
    const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());

    let networkError;
    let response;
    try {
      response = await attemptUpload(bytes, file, displayName);
    } catch (error) {
      networkError = error;
    }
    let outcome = await interpretAttempt(response, networkError);
    if (outcome !== null) return concludeUpload(outcome);

    // Connection-level failure: before re-POSTing, reconcile against the
    // library — if the first attempt actually landed server-side but the
    // response was lost, a blind retry would store a duplicate blob.
    await refetch();
    const fingerprint = await assetFingerprint(bytes);
    const stored = snapshot.library.find((a) => (
      fingerprint !== null ? a.sha256 === fingerprint
        : a.byteLength === bytes.length && a.displayName === (displayName ?? file?.name ?? "wallpaper")
    ));
    if (stored) return { asset: stored };

    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      response = await attemptUpload(bytes, file, displayName);
    } catch {
      return { error: "UPLOAD_FAILED" };
    }
    outcome = await interpretAttempt(response, undefined);
    if (outcome === null || outcome.kind !== "ok") {
      return outcome?.error !== undefined ? { error: outcome.error } : { error: "UPLOAD_FAILED" };
    }
    return concludeUpload(outcome);
  }

  async function concludeUpload(outcome) {
    if (outcome.error !== undefined) return { error: outcome.error };
    const body = await outcome.response.json();
    await refetch();
    announce();
    return { asset: body.asset };
  }

  async function deleteImage(id) {
    const blocked = gateWrites();
    if (blocked !== null) return { error: blocked };
    const response = await request(`/library/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { error: body?.code ?? `HTTP ${response.status}` };
    }
    const body = await response.json();
    await refetch();
    announce();
    return { affectedSkins: body.affectedSkins ?? [], revision: body.revision };
  }

  async function confirmRecovery() {
    const response = await request("/recovery", { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { error: body?.code ?? `HTTP ${response.status}` };
    }
    await refetch();
    return { ok: true };
  }

  function assetUrl(meta) {
    if (meta === null || meta === undefined || typeof meta.id !== "string") return null;
    return `${baseUrl}/assets/${meta.id}.${meta.extension}`;
  }

  const api = {
    boot: refetch,
    refetch,
    retry,
    flushNow,
    preview,
    previewReset,
    effectiveOverrides,
    uploadImage,
    deleteImage,
    confirmRecovery,
    assetUrl,
    getState: publicState,
    writeBlocked: gateWrites,
    onStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
      fetchGeneration += 1; // invalidate any in-flight response
      try { channel?.close(); } catch {}
      try {
        if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
      } catch {}
      listeners.clear();
    },
  };

  // Cross-tab sync: BroadcastChannel pings + focus refetch fallback.
  function onCrossTabMessage(event) {
    if (event?.data?.kind === "config-changed") refetch();
  }
  function onFocus() {
    refetch();
  }
  try {
    if (typeof BroadcastChannel === "function") {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = onCrossTabMessage;
      // Node keeps the event loop alive for open BroadcastChannels; release
      // that hold so test harnesses and SSR-ish environments can exit.
      if (typeof channel.unref === "function") channel.unref();
    }
  } catch {}
  try {
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
  } catch {}

  return api;
}
