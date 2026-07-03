/**
 * Unit test for the `useLoupe` hook. No DOM library is installed (no jsdom /
 * happy-dom / react-test-renderer / testing-library), so per the build brief we
 * stick to `react-dom/server` + store-level assertions. We render a probe
 * component through `renderToStaticMarkup` to actually run the hook inside React
 * (exercising useSyncExternalStore + the create-once store), capture the live
 * store the hook returns, and then assert that lock / clear / reset / clearAll
 * are reflected through the snapshot the hook reads.
 *
 * Relative imports so no install/link/build step is required.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { parseConfig } from "../../loupe-schema/src/index";
import {
  type LoupeStore,
  type Selections,
  createLoupeStore,
  recommendedSelections,
} from "../../loupe-core/src/index";
import { useLoupe } from "./index";

const cfg = parseConfig({
  version: 1,
  title: "Hook lock",
  assets: { hero: { src: "hero.png", width: 1000, height: 1000 } },
  groups: [
    {
      id: "color",
      title: "Color",
      options: [
        { id: "warm", label: "Warm", recommended: true, specimen: { kind: "palette", colors: ["#fff"] } },
        { id: "cool", label: "Cool", specimen: { kind: "palette", colors: ["#0ff"] } },
      ],
    },
    {
      id: "hero",
      title: "Hero",
      options: [
        { id: "a", label: "A", specimen: { kind: "imageCrop", asset: "hero", crop: { x: 0, y: 0, w: 1, h: 1 }, alt: "a" } },
        { id: "b", label: "B", recommended: true, specimen: { kind: "type", family: "Manrope", sample: "Hi" } },
      ],
    },
  ],
});

/**
 * Run `useLoupe` inside a real (server) React render and hand the live result
 * back out. The probe also prints the selections it received so we can assert
 * the SSR snapshot is what got rendered.
 */
function renderUseLoupe(
  config: typeof cfg,
  opts?: Parameters<typeof useLoupe>[1],
): { result: ReturnType<typeof useLoupe>; html: string } {
  let captured: ReturnType<typeof useLoupe> | null = null;
  function Probe(): ReactNode {
    const r = useLoupe(config, opts);
    captured = r;
    return <output data-sel={JSON.stringify(r.selections)} />;
  }
  const html = renderToStaticMarkup(<Probe />);
  if (!captured) throw new Error("probe did not run");
  return { result: captured, html };
}

describe("useLoupe", () => {
  it("returns a store and renders the SSR (recommended) snapshot", () => {
    const { result, html } = renderUseLoupe(cfg);
    // On the server, useSyncExternalStore uses getServerSnapshot === recommended.
    expect(result.selections).toEqual(recommendedSelections(cfg));
    expect(result.selections).toEqual({ color: "warm", hero: "b" });
    // And that snapshot is what actually rendered.
    expect(html).toContain(`data-sel="${escapeAttr(JSON.stringify({ color: "warm", hero: "b" }))}"`);
  });

  it("the store the hook owns reflects lock / clear / reset / clearAll via snapshot", () => {
    const { result } = renderUseLoupe(cfg);
    const store: LoupeStore = result.store;

    // Snapshot starts at recommended (client snapshot of a fresh store).
    expect(store.getSnapshot()).toEqual({ color: "warm", hero: "b" });

    store.lock("color", "cool");
    expect(store.getSnapshot()).toEqual({ color: "cool", hero: "b" });

    store.clear("hero");
    expect(store.getSnapshot().hero).toBeUndefined();
    expect(store.getSnapshot()).toEqual({ color: "cool", hero: undefined });

    store.reset();
    expect(store.getSnapshot()).toEqual({ color: "warm", hero: "b" });

    store.clearAll();
    expect(store.getSnapshot()).toEqual({});
  });

  it("subscribers fire on lock and the snapshot identity changes", () => {
    const { result } = renderUseLoupe(cfg);
    const store = result.store;
    const before = store.getSnapshot();
    let calls = 0;
    const off = store.subscribe(() => {
      calls++;
    });
    store.lock("hero", "a");
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(before); // new stable ref
    expect(store.getSnapshot().hero).toBe("a");
    off();
  });

  it("honors an injected store (opts.store) instead of creating one", () => {
    const shared: LoupeStore = createLoupeStore(cfg, { initial: { color: "cool", hero: undefined } as Selections });
    const { result } = renderUseLoupe(cfg, { store: shared });
    expect(result.store).toBe(shared);
    shared.lock("hero", "a");
    expect(result.store.getSnapshot()).toEqual({ color: "cool", hero: "a" });
  });
});

/** Mirror React's attribute escaping for the values we assert on. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
