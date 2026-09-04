/**
 * Minimal React stand-in for component-level public-path tests: hooks with
 * path-keyed PERSISTENT slot frames (local state survives re-renders), element
 * trees as plain objects, and a microtask-checkpoint effect runner. Shared by
 * the panel and switcher test suites (plan L4).
 */

export const jsx = (type, props, key) => ({ type, props: props ?? {}, key });

export function createFakeReact() {
  let rootThunk = null;
  let renderScheduled = false;
  const pendingEffects = [];
  const hookStack = [];
  const framesByKey = new Map(); // path → { slots: [], index: 0 }

  function rerender() {
    if (renderScheduled || rootThunk === null) return;
    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      rootThunk();
      drainEffects();
    });
  }

  function drainEffects() {
    while (pendingEffects.length > 0) pendingEffects.shift()();
  }

  function slot() {
    const frame = hookStack.at(-1);
    if (frame.index >= frame.slots.length) frame.slots.push({});
    return frame.slots[frame.index++];
  }

  function useState(initial) {
    const s = slot();
    if (!("value" in s)) s.value = typeof initial === "function" ? initial() : initial;
    return [s.value, (next) => {
      s.value = typeof next === "function" ? next(s.value) : next;
      rerender();
    }];
  }

  function useEffect(effect, deps) {
    const s = slot();
    // Deps-aware: re-run when the dep array changes (shallow), mirroring the
    // open/close listener effects of the switcher.
    const changed = !s.ran
      || deps === undefined
      || s.deps === undefined
      || deps.length !== s.deps.length
      || deps.some((d, i) => d !== s.deps[i]);
    if (changed) {
      s.ran = true;
      s.deps = deps;
      pendingEffects.push(effect);
    }
  }

  // Same drain semantics as useEffect here — paint-phase ordering is
  // unobservable in this DOM-less harness; the switcher's height sweep only
  // needs the "runs after commit, skipped when deps are unchanged" contract.
  const useLayoutEffect = useEffect;

  function useRef(initial) {
    const s = slot();
    if (!("ref" in s)) s.ref = { current: initial };
    return s.ref;
  }

  // Memoized per slot like the real hook — returning a fresh closure every
  // render would flip every [fn] dep array into an infinite effect loop.
  function useCallback(fn) {
    const s = slot();
    if (!("cb" in s)) s.cb = fn;
    return s.cb;
  }

  function instantiate(element, path = "root") {
    if (element === null || element === undefined || typeof element === "boolean") return null;
    if (typeof element === "string" || typeof element === "number") return element;
    if (Array.isArray(element)) {
      return element.map((child, index) => instantiate(child, `${path}/[${index}]`));
    }
    if (typeof element.type === "function") {
      const name = element.type.name || "anon";
      const framePath = `${path}/${name}${element.key === undefined ? "" : `#${element.key}`}`;
      let frame = framesByKey.get(framePath);
      if (frame === undefined) {
        frame = { slots: [], index: 0 };
        framesByKey.set(framePath, frame);
      }
      frame.index = 0; // rewind: each render consumes slots left-to-right
      hookStack.push(frame);
      try {
        return instantiate(element.type(element.props ?? {}), framePath);
      } finally {
        hookStack.pop();
      }
    }
    const children = element.props?.children;
    const node = {
      ...element,
      props: {
        ...element.props,
        children: children === undefined ? undefined : instantiate(children, `${path}/${String(element.type)}`),
      },
    };
    // Wire object refs so focus management is observable in tests.
    if (node.props.ref && typeof node.props.ref === "object") node.props.ref.current = node;
    return node;
  }

  return {
    useState, useEffect, useLayoutEffect, useRef, useCallback, instantiate,
    render(thunk) {
      rootThunk = thunk;
      const tree = thunk();
      queueMicrotask(drainEffects);
      return tree;
    },
  };
}

export function flatten(node) {
  if (node === null || node === undefined || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  const self = typeof node.type === "string" || node.type === undefined ? [node] : [];
  return [...self, ...flatten(node.props?.children)];
}

export function findButton(tree, text) {
  return flatten(tree).find((node) => node.type === "button" && node.props.children === text) ?? null;
}
