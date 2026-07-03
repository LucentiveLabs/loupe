/**
 * Browser entry bundled into the generated artifact. esbuild compiles this to a
 * single IIFE. It reads the embedded config + initial selections from globals
 * the HTML template defines, then mounts the interactive Loupe UI.
 *
 * This file is never imported by Node; it is an esbuild entry point only.
 */
import type { Config } from "@lucentive-labs/loupe-schema";
import type { Selections } from "@lucentive-labs/loupe-core";
import { mount } from "@lucentive-labs/loupe-dom";

declare global {
  interface Window {
    __LOUPE_CONFIG__?: Config;
    __LOUPE_INITIAL__?: Selections;
    __LOUPE_STORAGE_KEY__?: string;
  }
}

function boot(): void {
  const config = window.__LOUPE_CONFIG__;
  const el = document.getElementById("loupe-app");
  if (!config || !el) return;
  mount(el, config, {
    initial: window.__LOUPE_INITIAL__,
    storageKey: window.__LOUPE_STORAGE_KEY__,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
