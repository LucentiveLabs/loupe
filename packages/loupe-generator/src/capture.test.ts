import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serveCapture, type CaptureServer } from "./capture";

const MAX_BODY_BYTES = 5_000_000;

async function post(
  url: string,
  body: string | Buffer,
  contentType = "application/json",
): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  return { status: res.status, text: await res.text() };
}

describe("serveCapture", () => {
  let dir: string;
  let server: CaptureServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  async function start() {
    dir = mkdtempSync(join(tmpdir(), "loupe-capture-"));
    writeFileSync(
      join(dir, "index.html"),
      `<!doctype html><div id="loupe-app"></div>\n`,
      "utf8",
    );
    server = await serveCapture({ artifactDir: dir, outDir: join(dir, "out") });
    return server;
  }

  it("binds loopback by default", async () => {
    const s = await start();
    expect(s.url.startsWith("http://127.0.0.1:")).toBe(true);
  });

  it("rejects a missing or spoofed token with 403 and does not resolve lock", async () => {
    const s = await start();
    const lockUrl = `${s.url.replace(/\/$/, "")}/__loupe/lock`;
    const result = await post(
      lockUrl,
      JSON.stringify({ token: "spoof", markdown: "nope", json: {} }),
    );
    expect(result.status).toBe(403);
    expect(result.text).toMatch(/bad or missing token/);

    const raced = await Promise.race([
      s.lock.then(() => "resolved"),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 75)),
    ]);
    expect(raced).toBe("pending");
  });

  it("rejects invalid JSON with 400 and does not resolve lock", async () => {
    const s = await start();
    const lockUrl = `${s.url.replace(/\/$/, "")}/__loupe/lock`;
    const result = await post(lockUrl, "{not json");
    expect(result.status).toBe(400);
    expect(result.text).toMatch(/invalid json/);

    const raced = await Promise.race([
      s.lock.then(() => "resolved"),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 75)),
    ]);
    expect(raced).toBe("pending");
  });

  it("rejects an oversized body with 413", async () => {
    const s = await start();
    const lockUrl = `${s.url.replace(/\/$/, "")}/__loupe/lock`;
    const result = await post(lockUrl, Buffer.alloc(MAX_BODY_BYTES + 1, 0x61));
    expect(result.status).toBe(413);
    expect(result.text).toMatch(/brief too large/);
  });

  it("accepts the injected page token and resolves lock", async () => {
    const s = await start();
    const html = await (await fetch(s.url)).text();
    const match = html.match(/window\.__LOUPE_CAPTURE__ = ("[^"]+")/);
    expect(match).toBeTruthy();
    const token = JSON.parse(match![1]!) as string;
    const lockUrl = `${s.url.replace(/\/$/, "")}/__loupe/lock`;
    const result = await post(
      lockUrl,
      JSON.stringify({ token, markdown: "# brief", json: { ok: true } }),
    );
    expect(result.status).toBe(200);
    const captured = await s.lock;
    expect(captured.markdown).toBe("# brief");
    expect(captured.json).toEqual({ ok: true });
  });
});
