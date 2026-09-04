import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "@lucentive-labs/loupe-schema";
import { describe, expect, it } from "vitest";
import { generate } from "./index";

describe("generate", () => {
  it("writes a self-contained index.html", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "loupe-generator-"));

    try {
      const config = parseConfig({
        version: 1,
        assets: {},
        groups: [
          {
            id: "g",
            title: "G",
            options: [
              { id: "x", label: "X", specimen: { kind: "palette", colors: ["#fff"] } },
              { id: "y", label: "Y", specimen: { kind: "palette", colors: ["#000"] } },
            ],
          },
        ],
      });

      const result = await generate(config, { outDir });
      const htmlPath = join(outDir, "index.html");

      expect(existsSync(htmlPath)).toBe(true);
      expect(result.htmlPath).toBe(htmlPath);
      expect(result.html).toContain("<script");
      expect(result.html).toMatch(/<style|style=/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
