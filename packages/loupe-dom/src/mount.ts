/**
 * Browser mount: render the interactive Loupe UI into an element, wire all
 * interaction through the core store, and re-render on store changes.
 */
import type { Config } from "@lucentive-labs/loupe-schema";
import {
  type LoupeStore,
  type Selections,
  createLoupeStore,
  localStorageAdapter,
  resolveKeydown,
  rovingId,
  selectExportBrief,
  selectProgress,
  selectedWriteIn,
  tokensToCssVars,
} from "@lucentive-labs/loupe-core";
import { renderApp, renderBriefRows, renderComposedPreview, renderThumbs } from "./render.js";

export interface MountOptions {
  /** Initial selections (overrides storage + recommended). */
  initial?: Selections;
  /** localStorage key; when set, selections persist. Omit for ephemeral. */
  storageKey?: string;
  /** Provide an existing store instead of creating one. */
  store?: LoupeStore;
  /** Apply theme tokens as inline CSS variables on the root element. */
  applyTheme?: boolean;
}

export interface LoupeInstance {
  store: LoupeStore;
  destroy(): void;
}

/** Set the `--loupe-*` CSS variables for a theme onto an element. */
export function applyTheme(
  el: HTMLElement,
  tokens?: Config["theme"],
): void {
  const vars = tokensToCssVars(tokens);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

function flash(el: HTMLElement | null, msg: string, timers: Set<number>): void {
  if (!el) return;
  el.textContent = msg;
  const t = window.setTimeout(() => {
    el.textContent = "";
    timers.delete(t);
  }, 1900);
  timers.add(t);
}

/**
 * Mount the full interactive decision-lock UI.
 *
 * Returns the live store and a `destroy()` that unsubscribes and clears DOM.
 */
export function mount(
  el: HTMLElement,
  config: Config,
  opts: MountOptions = {},
): LoupeInstance {
  const store =
    opts.store ??
    createLoupeStore(config, {
      initial: opts.initial,
      storage: opts.storageKey ? localStorageAdapter(opts.storageKey) : undefined,
    });

  if (opts.applyTheme !== false) applyTheme(el, config.theme);
  el.classList.add("loupe-host");
  // A capture server injects window.__LOUPE_CAPTURE__; reveal the hand-off action only then.
  if (
    typeof window !== "undefined" &&
    (window as unknown as { __LOUPE_CAPTURE__?: unknown }).__LOUPE_CAPTURE__
  ) {
    el.classList.add("loupe-host--capture");
  }

  const timers = new Set<number>();
  // Flow-layout step index (ignored by page layout); survives store re-renders.
  let step = 0;
  // Group ids whose collapsible prompt is expanded; survives store re-renders.
  const openPrompts = new Set<string>();
  const stepCount = config.groups.length + 1; // groups + review
  // While a write-in input is being typed, skip the full innerHTML re-render
  // (which destroys + rebuilds the input and flickers the screen). We patch
  // only the derived live bits instead — see onInput + patchLive below.
  let suppressRender = false;

  const render = () => {
    if (suppressRender) return;
    const sel = store.getSnapshot();
    // Preserve focus across re-render by remembering the active tile address —
    // or, for a write-in input, its group + caret (typing commits per input
    // event, so the input is recreated mid-edit).
    const active = document.activeElement as HTMLElement | null;
    const focusGroup = active?.getAttribute("data-group");
    const focusOption = active?.getAttribute("data-option");
    const focusWriteIn = active?.getAttribute("data-loupe-writein");
    const caret = focusWriteIn ? (active as HTMLInputElement).selectionStart : null;

    el.innerHTML = renderApp(config, sel, { step, openPrompts });

    // Restore focus onto the equivalent tile (roving tabindex already set by render).
    if (focusGroup && focusOption) {
      const next = el.querySelector<HTMLElement>(
        `[data-loupe-part="tile"][data-group="${cssEscape(focusGroup)}"][data-option="${cssEscape(focusOption)}"]`,
      );
      next?.focus();
    } else if (focusWriteIn) {
      const next = el.querySelector<HTMLInputElement>(
        `[data-loupe-writein="${cssEscape(focusWriteIn)}"]`,
      );
      if (next) {
        next.focus();
        if (caret !== null) next.setSelectionRange(caret, caret);
      }
    }
  };

  // After a step change, move focus into the new step and bring it into view.
  const focusActiveStep = (): void => {
    el.querySelector<HTMLElement>(".loupe-step.is-active")?.scrollIntoView({ block: "start" });
    el
      .querySelector<HTMLElement>(
        '.loupe-step.is-active [data-loupe-part="tile"], .loupe-step.is-active button, .loupe-step.is-active textarea',
      )
      ?.focus();
  };

  const cssEscape = (s: string): string =>
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");

  // Surgical update for write-in typing: refresh only the progress count + rail
  // done-state (the composed preview + brief rebuild on the next step change),
  // so the focused input is never re-created and the screen doesn't flicker.
  const patchLive = (): void => {
    const sel = store.getSnapshot();
    const locked = String(selectProgress(config, sel).locked);
    // every progress counter (the page layout has several)
    el.querySelectorAll<HTMLElement>("[data-loupe-progress]").forEach((n) => {
      n.textContent = locked;
    });
    // rail done-state (flow layout)
    const railSteps = el.querySelectorAll<HTMLElement>("[data-loupe-rail-step]");
    config.groups.forEach((g, i) => {
      const decided = sel[g.id] !== undefined || selectedWriteIn(g, sel) !== "";
      railSteps[i]?.classList.toggle("is-done", decided);
      // the group's Clear button is `hidden` until the group is decided
      const clearBtn = el.querySelector<HTMLButtonElement>(`[data-loupe-clear="${cssEscape(g.id)}"]`);
      if (clearBtn) clearBtn.hidden = !decided;
    });
    // composed preview(s) + thumbs + brief — everything a write-in changes, and
    // all live in the page layout — patched in place so the focused input is
    // never re-created (no flicker) and nothing goes stale.
    el.querySelectorAll<HTMLElement>("[data-loupe-preview]").forEach((n) => {
      n.outerHTML = renderComposedPreview(config, sel);
    });
    const thumbs = el.querySelector<HTMLElement>("[data-loupe-thumbs-wrap]");
    if (thumbs) thumbs.innerHTML = renderThumbs(config, sel);
    const brief = el.querySelector<HTMLTextAreaElement>("[data-loupe-brief]");
    if (brief && brief !== document.activeElement) brief.value = selectExportBrief(config, sel).markdown;
    const summary = el.querySelector<HTMLElement>("[data-loupe-brief-summary]");
    if (summary) summary.innerHTML = renderBriefRows(config, sel);
  };

  // Reveal + select the (now collapsible) raw brief for the manual copy fallback.
  const selectBrief = (ta: HTMLTextAreaElement | null): void => {
    if (!ta) return;
    ta.closest("details")?.setAttribute("open", "");
    ta.select();
  };

  // ---- Event delegation on the host element ----
  const onClick = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;

    const tile = target.closest<HTMLElement>('[data-loupe-part="tile"]');
    if (tile) {
      const g = tile.getAttribute("data-group");
      const o = tile.getAttribute("data-option");
      if (g && o) store.lock(g, o);
      return;
    }
    // Flow navigation (Back / Next / jump via the rail).
    const nav = target.closest<HTMLElement>("[data-loupe-nav]");
    if (nav) {
      const dir = nav.getAttribute("data-loupe-nav");
      if (dir === "next") step = Math.min(step + 1, stepCount - 1);
      else if (dir === "back") step = Math.max(step - 1, 0);
      render();
      focusActiveStep();
      return;
    }
    const railStep = target.closest<HTMLElement>("[data-loupe-rail-step]");
    if (railStep) {
      const idx = Number(railStep.getAttribute("data-loupe-rail-step"));
      if (Number.isFinite(idx)) {
        step = Math.max(0, Math.min(idx, stepCount - 1));
        render();
        focusActiveStep();
      }
      return;
    }
    const clear = target.closest<HTMLElement>("[data-loupe-clear]");
    if (clear) {
      const g = clear.getAttribute("data-loupe-clear");
      if (g) store.clear(g);
      return;
    }
    const thumb = target.closest<HTMLElement>("[data-loupe-thumb]");
    if (thumb) {
      const g = thumb.getAttribute("data-loupe-thumb");
      const section = g ? el.querySelector<HTMLElement>(`#loupe-g-${cssEscape(g)}`) : null;
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (target.closest("[data-loupe-recommend]")) {
      store.reset();
      flash(el.querySelector<HTMLElement>("[data-loupe-status]"), "Recommended stack loaded.", timers);
      return;
    }
    if (target.closest("[data-loupe-reset]")) {
      store.clearAll();
      flash(el.querySelector<HTMLElement>("[data-loupe-status]"), "Cleared to blank.", timers);
      return;
    }
    if (target.closest("[data-loupe-scroll-brief]")) {
      el.querySelector("#loupe-brief")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (target.closest("[data-loupe-handoff]")) {
      const status = el.querySelector<HTMLElement>("[data-loupe-status]");
      const b = selectExportBrief(config, store.getSnapshot());
      // POST the locked brief back to the capture server so the agent continues
      // with no copy-paste. If there is no server (opened standalone), fall back
      // to the clipboard so the brief is never lost.
      fetch("/__loupe/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: (window as unknown as { __LOUPE_CAPTURE__?: unknown }).__LOUPE_CAPTURE__,
          markdown: b.markdown,
          json: b.json,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          flash(status, "Handed off — the agent has your brief. You can close this tab.", timers);
        })
        .catch(() => {
          const ta = el.querySelector<HTMLTextAreaElement>("[data-loupe-brief]");
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(b.markdown).then(
              () => flash(status, "No capture server — brief copied instead.", timers),
              () => {
                selectBrief(ta);
                flash(status, "Select the brief below and copy to hand off.", timers);
              },
            );
          } else {
            selectBrief(ta);
            flash(status, "Select the brief below and copy to hand off.", timers);
          }
        });
      return;
    }
    if (target.closest("[data-loupe-copy]")) {
      const brief = selectExportBrief(config, store.getSnapshot()).markdown;
      const status = el.querySelector<HTMLElement>("[data-loupe-status]");
      const ta = el.querySelector<HTMLTextAreaElement>("[data-loupe-brief]");
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(brief).then(
          () => flash(status, "Brief copied.", timers),
          () => {
            selectBrief(ta);
            flash(status, "Selected — press Cmd/Ctrl+C.", timers);
          },
        );
      } else {
        selectBrief(ta);
        flash(status, "Selected — press Cmd/Ctrl+C.", timers);
      }
      return;
    }
    const sheet = target.closest<HTMLElement>("[data-loupe-sheet-toggle]");
    if (sheet) {
      const stack = el.querySelector<HTMLElement>("[data-loupe-stack]");
      const open = stack?.classList.toggle("loupe-stack--open") ?? false;
      sheet.setAttribute("aria-expanded", String(open));
      return;
    }
  };

  // Write-in typing: every input event commits the raw value to the store,
  // which re-renders (brief, preview, progress, rail) with focus/caret restored.
  const onInput = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    const input = target?.closest<HTMLInputElement>("[data-loupe-writein]");
    if (!input) return;
    const g = input.getAttribute("data-loupe-writein");
    if (!g) return;
    // Commit the value but suppress the full re-render so the input keeps focus
    // and the screen doesn't flicker; patch only the live-derived bits.
    suppressRender = true;
    store.writeIn(g, input.value);
    suppressRender = false;
    // reflect filled/empty on the focused input itself (no re-render)
    input.dataset.state = input.value.trim() === "" ? "empty" : "filled";
    patchLive();
  };

  const onKeydown = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    const tile = target?.closest<HTMLElement>('[data-loupe-part="tile"]');
    if (!tile) return;
    const groupId = tile.getAttribute("data-group");
    const optionId = tile.getAttribute("data-option");
    if (!groupId || !optionId) return;
    const group = config.groups.find((g) => g.id === groupId);
    if (!group) return;
    const res = resolveKeydown(group, optionId, ev.key);
    if (!res) return;
    ev.preventDefault();
    store.lock(group.id, res.lock);
    // After re-render, move focus to the target tile.
    const focusTarget = el.querySelector<HTMLElement>(
      `[data-loupe-part="tile"][data-group="${cssEscape(groupId)}"][data-option="${cssEscape(res.focus)}"]`,
    );
    focusTarget?.focus();
  };

  // Track collapsible-prompt <details> open state so it survives re-renders.
  // No re-render here — the browser already shows/hides the content; we only
  // record the state for the NEXT render.
  const onToggle = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    const g = target?.getAttribute?.("data-loupe-prompt-details");
    if (!g) return;
    if ((target as HTMLDetailsElement).open) openPrompts.add(g);
    else openPrompts.delete(g);
  };

  el.addEventListener("click", onClick);
  el.addEventListener("keydown", onKeydown);
  el.addEventListener("input", onInput);
  // `toggle` does not bubble; listen in the capture phase to observe it here.
  el.addEventListener("toggle", onToggle, true);

  const unsubscribe = store.subscribe(render);
  render();

  return {
    store,
    destroy() {
      unsubscribe();
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKeydown);
      el.removeEventListener("input", onInput);
      el.removeEventListener("toggle", onToggle, true);
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
      el.innerHTML = "";
      el.classList.remove("loupe-host");
    },
  };
}

// Re-export so renderers can address roving focus deterministically if needed.
export { rovingId };
