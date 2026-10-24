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
 *   - retry exhaustion or an unchanged normal refetch lands in the conflict
 *     notice; ordinary failures land in the kind-exclusive error notice;
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
// ADR-0018: the write dialect's retry sentinel — a conflict/unknown-409 policy
// returns this (instead of a final result) to spend the single retry on a
// fresh baseRevision. Symbol so it can never collide with a result object.
const RETRY = Symbol("dsh-skins:write-dialect-retry");

function cloneSkins(skins) {
  return skins === undefined || skins === null ? {} : structuredClone(skins);
}

export function createConfigClient(options = {}) {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  const baseUrl = options.baseUrl ?? "/dsh-skins";
  const profile = options.profile === "desktop" ? "desktop" : "web";
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
  // Flush notices: at most one per kind; conflict/error are kind-exclusive
  // (a conflict replaces the error); error and reverted legally coexist — a
  // partial-dangling batch excises AND names the survivor's failure.
  let notices = [];
  let channel = null;

  /** Replace the conflict/error notices (the kind-exclusive pair); the
   * reverted notice is untouched — only a healthy flush retires it. */
  function setFlushFailure(code, message) {
    notices = notices.filter((notice) => notice.kind === "reverted");
    if (code === "REVISION_CONFLICT") notices.push({ kind: "conflict" });
    // Truthy on purpose: an empty-string host message is suppressed exactly
    // as the pre-notices panel's falsy strip check did (pixel-parity red line).
    else if (message) notices.push({ kind: "error", message });
  }

  /** Name one excised dangling field on the reverted notice (dedup by field). */
  function noteReverted(entry) {
    const current = notices.find((notice) => notice.kind === "reverted");
    if (current !== undefined && current.fields.some((field) => field.skinId === entry.skinId && field.key === entry.key)) return;
    notices = [
      ...notices.filter((notice) => notice.kind !== "reverted"),
      { kind: "reverted", fields: [...(current?.fields ?? []), entry] },
    ];
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
      notices: structuredClone(notices),
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

  /** Single write gate (canWrite's source): null = writable, else the reason. */
  function writeGate() {
    if (status === "synced") {
      return snapshot.mode === "recovery" ? "recovery" : null;
    }
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

  /**
   * The write dialect's single client-side interpreter (ADR-0018). The shared
   * skeleton lives here and only here: write-chain serialization, the
   * execution-time write gate, PATCH construction, the attempt loop, the
   * STORE_READONLY downgrade, and the UNIFIED 409 code table — every 409
   * code the Host owns is dispatched from this one ladder; adding a code is
   * one branch here plus a policy hook. Per-path dispositions are injected
   * as the policy: the ADR-0003 revision-advance retry (field writes), the
   * ADR-0015 Q10-a goal predicate (gallery writes), issues excision, and the
   * return-shape translation. A conflict / unknown-409 policy may return the
   * RETRY sentinel to spend the single retry on a fresh baseRevision.
   */
  function runWriteOp(operations, policy) {
    writeChain = writeChain.then(async () => {
      try {
        if (disposed) return policy.disposed();
        const blocked = writeGate();
        if (blocked !== null) return policy.gated(blocked);
        const attemptedRevision = snapshot.revision;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          let response;
          try {
            response = await request("/config", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ baseRevision: snapshot.revision, operations: operations() }),
            });
          } catch (error) {
            return policy.offline(error);
          }
          if (disposed) return policy.disposedMidflight();
          if (response.status === 409) {
            const conflictBody = await response.json().catch(() => null);
            const code = conflictBody?.code;
            const errorMessage = conflictBody?.error ?? "HTTP 409";
            if (code === "STORE_READONLY") {
              setFlushFailure(null, null);
              setStatus("unsupported-readonly");
              return policy.readOnly(conflictBody);
            }
            if (code === "REVISION_CONFLICT") {
              const decision = await policy.onConflict({ attempt, attemptedRevision, errorMessage });
              if (decision === RETRY) continue;
              return decision;
            }
            if (code === "STORE_RECOVERY_REQUIRED") return policy.onRecoveryRequired(errorMessage);
            const decision = await policy.onUnknown409({ attempt, errorMessage });
            if (decision === RETRY) continue;
            return decision;
          }
          if (!response.ok) return await policy.onError(response);
          const result = await policy.onSuccess(response);
          // Resync from the Host rather than trusting a racing local snapshot:
          // a refetch issued mid-flight may otherwise resurrect pre-write state.
          await refetch();
          announce();
          return result;
        }
        return policy.exhausted();
      } catch (error) {
        return policy.chainError(error);
      }
    });
    return writeChain;
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
    // ADR-0018: the dialect machine lives in runWriteOp; this thin wrapper
    // owns only the field-path policy — the ADR-0003 conflict discipline and
    // the ADR-0015 dangling-preview excision.
    return runWriteOp(buildOperations, {
      disposed: () => ({ flushed: 0, blocked: "disposed" }),
      disposedMidflight: () => ({ flushed: 0 }),
      gated: (blocked) => ({ flushed: 0, blocked }),
      offline: (error) => {
        throw error; // one network failure must reach chainError, never poison the chain
      },
      readOnly: (conflictBody) => ({ flushed: 0, blocked: "conflict", errorMessage: conflictBody?.error ?? "" }),
      // ADR-0003: retry once only after a conflict refetch has actually
      // applied a newer normal-mode snapshot.
      onConflict: async ({ attempt, attemptedRevision }) => {
        if (attempt === 1) {
          setFlushFailure("REVISION_CONFLICT", null);
          emit();
          return { flushed: 0, blocked: "conflict" };
        }
        const refreshed = await refetch();
        const mayRetry = refreshed.status === "synced"
          && refreshed.mode === "normal"
          && refreshed.revision !== attemptedRevision;
        if (mayRetry) return RETRY;

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
      },
      onRecoveryRequired: async (errorMessage) => {
        const refreshed = await refetch();
        if (refreshed.mode === "recovery") {
          setFlushFailure(null, null);
          emit();
          return { flushed: 0, blocked: "recovery" };
        }
        setFlushFailure(null, errorMessage);
        emit();
        return { flushed: 0, blocked: "error", errorMessage };
      },
      onUnknown409: ({ errorMessage }) => {
        setFlushFailure(null, errorMessage);
        emit();
        return { flushed: 0, blocked: "error", errorMessage };
      },
      onError: async (response) => {
        // ADR-0015: a 400 with structured params.issues lets the client
        // NAME the poison. Dangling references (MISSING_ASSET / BAD_ASSET)
        // are excised and reported on the reverted notice instead of staying
        // dirty forever and blocking every later auto-save; every other
        // issue keeps its previews dirty and surfaces the named error.
        const errorBody = await response.json().catch(() => null);
        const errorMessage = errorBody?.error ?? `HTTP ${response.status}`;
        const issues = Array.isArray(errorBody?.params?.issues) ? errorBody.params.issues : null;
        let excised = false;
        let onlyDangling = issues !== null && issues.length > 0;
        if (issues !== null) {
          for (const issue of issues) {
            const dangling = issue.code === "MISSING_ASSET" || issue.code === "BAD_ASSET";
            if (!dangling) onlyDangling = false;
            if (dangling && typeof issue.skinId === "string" && typeof issue.key === "string") {
              const composite = `${issue.skinId} ${issue.key}`;
              // Only a deletion in THIS round counts: the continuation is
              // bounded by "each round removes ≥1 preview" (a repeat issue
              // for an already-excised field must not re-arm the loop).
              if (previews.has(composite)) {
                previews.delete(composite);
                excised = true;
                noteReverted({ skinId: issue.skinId, key: issue.key });
              }
            }
          }
        }
        // A batch whose issues are ALL dangling is fully self-healed: the
        // named reversion notice replaces the generic failure strip — but
        // only when something was actually excised. A dangling-coded
        // issue with a malformed payload (no skinId/key) keeps its named
        // error: unknown shapes never pass silently.
        const healed = onlyDangling && excised;
        setFlushFailure(null, healed ? null : errorMessage);
        emit();
        // Self-healing continuation: re-flush the surviving previews
        // without waiting for the user's next edit. Bounded — each
        // continuation excises at least one more preview or terminates on
        // a named error.
        if (excised && previews.size > 0) void flushNow();
        if (healed) return { flushed: 0, blocked: null, selfHealed: true };
        return { flushed: 0, blocked: "error", errorMessage };
      },
      onSuccess: async (response) => {
        await response.json().catch(() => null); // drained; resync happens in refetch()
        // Clear only previews the user has not superseded during the flight.
        for (const [composite, value] of intent) {
          if (previews.get(composite) === value) previews.delete(composite);
        }
        setFlushFailure(null, null);
        notices = []; // a healthy flush retires every notice (conflict, error, reverted)
        return { flushed: count };
      },
      exhausted: () => ({ flushed: 0, blocked: "conflict" }),
      chainError: () => {
        // The chain itself must stay fulfilled: one network failure may
        // never poison subsequent flushes (previews stay dirty for retry).
        setFlushFailure(null, null);
        emit();
        return { flushed: 0, blocked: "error" };
      },
    });
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
    if (isSameOverrideValue(value, defaultsFor(skinId, profile)[key])) {
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
    const blocked = writeGate();
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
    // Local merge (ADR-0015 rider ①): the upload response carries
    // {asset, revision} and an append rewrites neither references nor
    // overrides, so the snapshot is merged locally instead of pulling a full
    // refetch — batch uploads drop from 2N to N+1 round trips. Other tabs
    // still hear the announce() ping; divergence self-heals on the next
    // flush/focus resync.
    if (body?.asset?.id !== undefined) {
      snapshot = {
        ...snapshot,
        revision: typeof body.revision === "number" ? body.revision : snapshot.revision,
        library: [...snapshot.library, body.asset],
        quota: {
          count: (snapshot.quota?.count ?? 0) + 1,
          totalBytes: (snapshot.quota?.totalBytes ?? 0) + (body.asset.byteLength ?? 0),
        },
      };
      emit();
    }
    announce();
    return { asset: body.asset };
  }

  /**
   * One gallery write through the unified PATCH dialect (ADR-0015), serialized
   * on the write chain with field flushes (a pending debounced flush must
   * never race the delete's baseRevision). Conflict semantics (ADR-0018): the
   * conflict family (REVISION_CONFLICT and unknown 409s) → refetch → the goal
   * is already achieved (asset gone / library empty) → silent success
   * (GLOSSARY 悬空预览/B2); otherwise retry once on the fresh baseRevision,
   * then a named error; STORE_RECOVERY_REQUIRED is dispatched by name — one
   * refetch, then the host-stable code passes through unsuppressed, with no
   * goal check and no retry. Success keeps the post-success refetch:
   * deletes rewrite server-computed references, which no local merge can
   * reproduce (asymmetric with the append-only upload).
   */
  function runGalleryOp(operations, goalAchieved) {
    // ADR-0018: the dialect machine lives in runWriteOp; this thin wrapper
    // owns only the gallery-path policy — the ADR-0015 Q10-a goal predicate
    // (a contender finishing the job is silent success) and the
    // ASSET_NOT_FOUND excision special case.
    const conflictDisposition = async ({ attempt }) => {
      await refetch();
      if (goalAchieved()) return { affectedSkins: [] }; // a contender finished the job
      if (attempt === 1) {
        setFlushFailure(null, null);
        emit();
        return { error: "REVISION_CONFLICT" };
      }
      return RETRY; // retry once on the fresh baseRevision
    };
    return runWriteOp(() => operations, {
      disposed: () => ({ error: "disposed" }),
      disposedMidflight: () => ({ error: "disposed" }),
      gated: (blocked) => ({ error: blocked }),
      offline: () => ({ error: "OFFLINE" }),
      readOnly: () => ({ error: "conflict" }),
      onConflict: conflictDisposition,
      // ADR-0018 alignment: the recovery code is dispatched BY NAME now —
      // never folded into the blind conflict retry. Code passthrough: the
      // Host-stable code reaches the caller unsuppressed (host-errors.js
      // resolves it), after one refetch so the recovery banner can land.
      onRecoveryRequired: async () => {
        await refetch();
        return { error: "STORE_RECOVERY_REQUIRED" };
      },
      onUnknown409: conflictDisposition, // unknown 409s keep the goal-first read
      onError: async (response) => {
        const body = await response.json().catch(() => null);
        if (body?.code === "INVALID_CONFIG"
          && body.params?.issues?.some((issue) => issue.code === "ASSET_NOT_FOUND")) {
          await refetch();
          if (goalAchieved()) return { affectedSkins: [] };
          return { error: "ASSET_NOT_FOUND" };
        }
        return { error: body?.code ?? `HTTP ${response.status}` };
      },
      onSuccess: async (response) => {
        const body = await response.json().catch(() => null);
        return { affectedSkins: body?.affectedSkins ?? [], revision: body?.revision };
      },
      exhausted: () => ({ error: "REVISION_CONFLICT" }),
      chainError: (error) => {
        throw error; // pre-ADR-0018 shape: chain-level faults reject the chain
      },
    });
  }

  async function deleteImage(id) {
    const blocked = writeGate();
    if (blocked !== null) return { error: blocked };
    return runGalleryOp([{ op: "deleteAsset", assetId: id }],
      () => !snapshot.library.some((entry) => entry.id === id));
  }

  function clearLibrary() {
    return runGalleryOp([{ op: "clearLibrary" }], () => snapshot.library.length === 0);
  }

  /** Valued preview fields (reset ops reference nothing). */
  function valuedPreviews() {
    const fields = [];
    for (const [composite, value] of previews) {
      if (value === null) continue;
      const [skinId, key] = composite.split(" ");
      fields.push({ skinId, key, value });
    }
    return fields;
  }

  /** References to an asset across both layers: the persisted snapshot's
   * field references first, then preview-layer (unsaved) references — the
   * confirm dialogs render both, previews marked unsaved (ADR-0015). */
  function referencesFor(assetId) {
    const persisted = (snapshot.references?.[assetId] ?? [])
      .map((entry) => ({ skinId: entry.skinId, key: entry.key, layer: "persisted" }));
    const preview = valuedPreviews()
      .filter((entry) => entry.value === assetId)
      .map((entry) => ({ skinId: entry.skinId, key: entry.key, layer: "preview" }));
    return [...persisted, ...preview];
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
    flushNow,
    preview,
    previewReset,
    effectiveOverrides,
    uploadImage,
    deleteImage,
    clearLibrary,
    referencesFor,
    confirmRecovery,
    assetUrl,
    getState: publicState,
    canWrite: () => writeGate() === null,
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
