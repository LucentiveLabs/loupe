// @vitest-environment jsdom
/**
 * Collapsible-prompt open-state persistence: mount() rebuilds the whole app
 * via innerHTML on every store change, so an expanded <details> would snap
 * shut unless the capture-phase toggle listener records it into the render
 * view. This is the riskiest DOM behavior of the glanceability feature —
 * asserted here against a real (jsdom) DOM.
 */
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../loupe-schema/src/index";
import { mount } from "./mount";

const cfg = parseConfig({
  version: 1,
  layout: "page",
  question: "Which direction?",
  assets: {},
  groups: [
    {
      id: "g",
      title: "G",
      prompt: "Long context that should collapse.",
      promptLead: "The one-line job.",
      promptCollapsible: true,
      options: [
        { id: "a", label: "A", specimen: { kind: "decision", summary: "Alpha" } },
        { id: "b", label: "B", specimen: { kind: "decision", summary: "Beta" } },
      ],
    },
  ],
});

function details(el: HTMLElement): HTMLDetailsElement {
  const d = el.querySelector<HTMLDetailsElement>('details[data-loupe-prompt-details="g"]');
  if (!d) throw new Error("collapsible prompt not rendered");
  return d;
}

describe("collapsible prompt open state", () => {
  it("starts closed, survives store re-renders open, and re-closes", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const { store, destroy } = mount(el, cfg);

    expect(details(el).open).toBe(false);

    // Open it the way a browser does: flip the property, fire `toggle`.
    const d1 = details(el);
    d1.open = true;
    d1.dispatchEvent(new Event("toggle"));

    store.lock("g", "a"); // full innerHTML re-render
    expect(details(el).open).toBe(true);

    const d2 = details(el);
    d2.open = false;
    d2.dispatchEvent(new Event("toggle"));

    store.clear("g"); // another re-render
    expect(details(el).open).toBe(false);

    destroy();
    expect(el.innerHTML).toBe("");
    document.body.removeChild(el);
  });

  it("question renders as headline with the title as eyebrow", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const { destroy } = mount(el, cfg);
    expect(el.querySelector(".loupe-group__question")?.textContent).toBe("Which direction?");
    expect(el.querySelector(".loupe-group__title")?.classList.contains("loupe-group__title--eyebrow")).toBe(true);
    expect(
      el.querySelector('[data-loupe-part="group"]')?.getAttribute("aria-label"),
    ).toBe("Which direction? (G)");
    destroy();
    document.body.removeChild(el);
  });
});
