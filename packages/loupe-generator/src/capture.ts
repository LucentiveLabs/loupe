/**
 * @lucentive-labs/loupe-generator — capture server (Node-only).
 *
 * Serves a generated Loupe artifact over http://127.0.0.1 and accepts the
 * locked export brief back via `POST /__loupe/lock`, writing it to a file. This
 * closes the agent loop without a copy-paste: an agent generates the artifact,
 * runs `serveCapture`, opens the URL for a human, and `await`s `lock` — which
 * resolves the moment the human clicks "Hand off & continue" in the browser.
 *
 * When serving `index.html` it injects `window.__LOUPE_CAPTURE__ = true` so the
 * artifact reveals its hand-off action; opened as a plain file:// (no server)
 * that action stays hidden and the artifact falls back to copy-to-clipboard.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const LOCK_PATH = "/__loupe/lock";
const MAX_BODY_BYTES = 5_000_000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface CaptureOptions {
  /** Directory containing the generated `index.html` (+ `assets/`). */
  artifactDir: string;
  /** Directory the captured brief is written to. Default: `<cwd>/.loupe`. */
  outDir?: string;
  /** Base name for the written brief files. Default: `"brief"`. */
  name?: string;
  /** Port to listen on. Default: `0` (an ephemeral free port). */
  port?: number;
  /** Interface to bind. Default: `"127.0.0.1"` (loopback only). */
  host?: string;
}

export interface CapturedBrief {
  markdown: string;
  json: unknown;
  /** Absolute path of the written `<name>.brief.json`. */
  jsonPath: string;
  /** Absolute path of the written `<name>.brief.md`. */
  mdPath: string;
}

export interface CaptureServer {
  /** The served artifact URL (open this in a browser). */
  url: string;
  port: number;
  /** Resolves once the artifact POSTs its locked brief (files are written first). */
  lock: Promise<CapturedBrief>;
  /** Stop the server. */
  close(): Promise<void>;
}

/** Start a capture server for a generated artifact directory. */
export function serveCapture(opts: CaptureOptions): Promise<CaptureServer> {
  const artifactDir = path.resolve(opts.artifactDir);
  const outDir = path.resolve(opts.outDir ?? path.join(process.cwd(), ".loupe"));
  const name = (opts.name ?? "brief").replace(/[^a-zA-Z0-9._-]/g, "-") || "brief";
  const host = opts.host ?? "127.0.0.1";
  // Per-server token: injected into the served page and required on POST, so a
  // different local process can't spoof the hand-off or overwrite the brief.
  const token = randomUUID();
  let resolved = false;

  let resolveLock!: (b: CapturedBrief) => void;
  let rejectLock!: (e: unknown) => void;
  const lock = new Promise<CapturedBrief>((res, rej) => {
    resolveLock = res;
    rejectLock = rej;
  });

  const server = http.createServer((req, res) => {
    // --- capture endpoint ---
    if (req.method === "POST" && (req.url ?? "") === LOCK_PATH) {
      if (resolved) {
        res.writeHead(410, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "already handed off" }));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;
      req.on("data", (c: Buffer) => {
        if (aborted) return;
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          aborted = true;
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "brief too large" }));
          req.destroy();
        } else {
          chunks.push(c);
        }
      });
      req.on("end", () => {
        if (aborted) return;
        // Parse + authenticate. A malformed or foreign POST is rejected but does
        // NOT end the wait — the server keeps listening for the genuine lock.
        let body: { token?: unknown; markdown?: unknown; json?: unknown };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid json" }));
          return;
        }
        if (body.token !== token) {
          res.writeHead(403, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "bad or missing token" }));
          return;
        }
        // Authenticated: persist. A write failure IS fatal — reject the lock so
        // an awaiting agent fails fast instead of hanging.
        const markdown = typeof body.markdown === "string" ? body.markdown : "";
        const jsonPath = path.join(outDir, `${name}.brief.json`);
        const mdPath = path.join(outDir, `${name}.brief.md`);
        try {
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(jsonPath, `${JSON.stringify(body.json ?? {}, null, 2)}\n`, "utf8");
          fs.writeFileSync(mdPath, markdown, "utf8");
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(e) }));
          rejectLock(e);
          return;
        }
        resolved = true;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        resolveLock({ markdown, json: body.json, jsonPath, mdPath });
      });
      return;
    }

    // --- static file serving (loopback, traversal-guarded) ---
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    let urlPath: string;
    try {
      urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    } catch {
      res.writeHead(400);
      res.end("bad request");
      return;
    }
    if (urlPath.includes("\0")) {
      res.writeHead(400);
      res.end("bad request");
      return;
    }
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const filePath = path.join(artifactDir, rel);
    if (filePath !== artifactDir && !filePath.startsWith(artifactDir + path.sep)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] ?? "application/octet-stream";
      let out: Buffer = data;
      if (ext === ".html") {
        // Inject the per-server token so only this served page reveals its
        // hand-off action and can authenticate the lock POST. Anchored on the
        // unique #loupe-app node so a stray literal elsewhere can't consume it.
        out = Buffer.from(
          data
            .toString("utf8")
            .replace(
              '<div id="loupe-app"></div>',
              `<div id="loupe-app"></div>\n    <script>window.__LOUPE_CAPTURE__ = ${JSON.stringify(token)};</script>`,
            ),
          "utf8",
        );
      }
      res.writeHead(200, { "content-type": type });
      res.end(req.method === "HEAD" ? undefined : out);
    });
  });

  return new Promise<CaptureServer>((resolve, reject) => {
    server.once("error", (e) => {
      rejectLock(e);
      reject(e);
    });
    server.listen(opts.port ?? 0, host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://${host}:${port}/`,
        port,
        lock,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}
