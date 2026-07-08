import { z } from "zod";

/**
 * Loupe configuration schema — the contract a human or an AI agent fills to
 * describe a decision-lock. Zod is the single source of truth; TS types
 * are inferred, and `toJsonSchema()` emits the contract for agent authoring.
 */

/** Normalized crop rectangle: fractions (0..1) of the intrinsic image. */
export const Rect = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .superRefine((r, ctx) => {
    const EPS = 1e-6;
    if (r.w <= 0 || r.h <= 0)
      ctx.addIssue({ code: "custom", message: "crop w and h must be > 0" });
    if (r.x + r.w > 1 + EPS)
      ctx.addIssue({ code: "custom", message: "crop x + w must be <= 1" });
    if (r.y + r.h > 1 + EPS)
      ctx.addIssue({ code: "custom", message: "crop y + h must be <= 1" });
  });
export type TRect = z.infer<typeof Rect>;

/** Named, safe motion presets (no arbitrary CSS for agent-authored configs). */
export const MotionPreset = z.enum(["breathe", "pan", "field"]);
export type TMotionPreset = z.infer<typeof MotionPreset>;

/** Layout-mock plans for the "hero composition / explanation" specimen kinds. */
export const LayoutPlan = z.enum([
  "portrait",
  "threshold",
  "sparse",
  "chapters",
  "belowfold",
  "stack",
]);
export type TLayoutPlan = z.infer<typeof LayoutPlan>;

const SpecimenImageCrop = z.object({
  kind: z.literal("imageCrop"),
  asset: z.string().min(1),
  crop: Rect,
  alt: z.string().min(1),
});
const SpecimenPalette = z.object({
  kind: z.literal("palette"),
  colors: z.array(z.string().min(1)).min(1).max(8),
  over: z.string().optional(),
});
const SpecimenType = z.object({
  kind: z.literal("type"),
  family: z.string().min(1),
  weight: z.number().int().min(100).max(900).optional(),
  sample: z.string().min(1),
  kicker: z.string().optional(),
});
const SpecimenMotion = z.object({
  kind: z.literal("motion"),
  preset: MotionPreset,
  asset: z.string().optional(),
  crop: Rect.optional(),
  asset2: z.string().optional(),
  crop2: Rect.optional(),
});
const SpecimenLayout = z.object({
  kind: z.literal("layoutMock"),
  plan: LayoutPlan,
  asset: z.string().optional(),
  crop: Rect.optional(),
  asset2: z.string().optional(),
  crop2: Rect.optional(),
});

/**
 * Text-first specimen for strategic / non-visual decision flows (org
 * structures, naming calls, go/no-go gates). `summary` is the statement the
 * tile leads with; `detail` is supporting prose (line breaks are preserved,
 * so it can carry multi-line copy); `flags` are short badge
 * chips (e.g. "COUNSEL", "public copy", "reversible").
 */
const SpecimenDecision = z.object({
  kind: z.literal("decision"),
  summary: z.string().min(1),
  /** Supporting text under the summary. Line breaks are preserved, so this can
   * carry multi-paragraph prose (e.g. a full copy block in a copy pick). */
  detail: z.string().optional(),
  flags: z.array(z.string().min(1).max(40)).max(6).optional(),
});

export const Specimen = z.discriminatedUnion("kind", [
  SpecimenImageCrop,
  SpecimenPalette,
  SpecimenType,
  SpecimenMotion,
  SpecimenLayout,
  SpecimenDecision,
]);
export type TSpecimen = z.infer<typeof Specimen>;
export type TSpecimenKind = TSpecimen["kind"];

export const Option = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  caption: z.string().optional(),
  recommended: z.boolean().optional(),
  specimen: Specimen,
});
export type TOption = z.infer<typeof Option>;

export const Group = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    /**
     * The step's task question ("Which copy is stronger?"). When set (or
     * inherited from `Config.question`), it renders as the step's visual
     * headline and the title demotes to a small-caps eyebrow — the ask must
     * be findable at a glimpse, never buried in small muted text.
     */
    question: z.string().optional(),
    prompt: z.string().optional(),
    /** Always-visible one-line lead shown above the prompt (e.g. the one
     * sentence that states the job, extracted verbatim from a longer brief). */
    promptLead: z.string().optional(),
    /**
     * Progressive disclosure: collapse the full `prompt` behind a summary
     * toggle so long context stops burying the options. The lead (and the
     * question) stay visible; the full prompt is one click away. Requires
     * `prompt`.
     */
    promptCollapsible: z.boolean().optional(),
    /** Label for the collapsed-prompt toggle. Default: "Full context". */
    promptSummary: z.string().optional(),
    /**
     * A locked group renders read-only: its `recommended` option is the fixed
     * pick, tiles are inert, and the store refuses changes. Use for decisions
     * already taken that must stay visible in the flow. Locked groups may carry
     * a single option; open groups still need 2-6 (see `validateConfig`).
     */
    locked: z.boolean().optional(),
    /**
     * Whether the group renders the free-text "something else" write-in under
     * its tiles. DEFAULTS TO TRUE for open groups — every open decision always
     * offers a write-in unless a config opts out with `allowWriteIn: false`.
     * Locked groups never get one (they are decided context); setting
     * `allowWriteIn: true` on a locked group is a contradiction and is rejected.
     */
    allowWriteIn: z.boolean().optional(),
    options: z.array(Option).min(1).max(6),
  })
  .superRefine((g, ctx) => {
    if (!g.locked && g.options.length < 2)
      ctx.addIssue({
        code: "custom",
        message: `group "${g.id}": open groups need 2-6 options (or set locked: true)`,
      });
    if (g.locked && !g.options.some((o) => o.recommended))
      ctx.addIssue({
        code: "custom",
        message: `locked group "${g.id}" needs a recommended option to hold its fixed pick`,
      });
    if (g.locked && g.allowWriteIn === true)
      ctx.addIssue({
        code: "custom",
        message: `locked group "${g.id}" cannot allow a write-in (locked groups are decided context)`,
      });
    if (g.promptCollapsible && !g.prompt)
      ctx.addIssue({
        code: "custom",
        message: `group "${g.id}" sets promptCollapsible without a prompt to collapse`,
      });
    if (g.promptSummary && !g.promptCollapsible)
      ctx.addIssue({
        code: "custom",
        message: `group "${g.id}" sets promptSummary without promptCollapsible`,
      });
  });
export type TGroup = z.infer<typeof Group>;

export const Asset = z.object({
  src: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type TAsset = z.infer<typeof Asset>;

export const PreviewBand = z.object({
  slot: z.string().min(1),
  fromGroup: z.string().min(1),
  as: z.enum(["feature", "band", "swatch", "headline", "systems"]).optional(),
});
export const Preview = z.object({
  bands: z.array(PreviewBand).min(1),
  headlineFrom: z.string().optional(),
});
export type TPreview = z.infer<typeof Preview>;

/** Brand tokens: kebab keys WITHOUT the `--loupe-` prefix, e.g. `color-primary`. */
export const ThemeTokens = z.record(z.string(), z.string());
export type TThemeTokens = z.infer<typeof ThemeTokens>;

export const Config = z.object({
  version: z.literal(1),
  title: z.string().optional(),
  /** Default task question for every group (see `Group.question`). A group's
   * own `question` overrides it. */
  question: z.string().optional(),
  /** Presentation: "flow" = guided one-question-at-a-time stepper (generator/DOM default); "page" = dense single scroll. The React `<Loupe>` adapter renders "page" (flow is generator/DOM-only for now). */
  layout: z.enum(["flow", "page"]).optional(),
  assets: z.record(z.string(), Asset).default({}),
  theme: ThemeTokens.optional(),
  groups: z.array(Group).min(1),
  preview: Preview.optional(),
  banned: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  workflow: z.array(z.string()).optional(),
});
export type Config = z.infer<typeof Config>;

/** Structural parse (throws on invalid). */
export function parseConfig(input: unknown): Config {
  return Config.parse(input);
}

/** JSON Schema for agent authoring. Pinned to input mode (what authors write). */
export function toJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(Config, { io: "input" }) as Record<string, unknown>;
}

/**
 * Semantic validation beyond structure: unique ids, asset references,
 * preview band references, and alt coverage. Returns human-readable errors
 * (empty array = valid).
 */
export function validateConfig(cfg: Config): string[] {
  const errs: string[] = [];
  const groupIds = new Set<string>();
  for (const g of cfg.groups) {
    if (groupIds.has(g.id)) errs.push(`duplicate group id: "${g.id}"`);
    groupIds.add(g.id);
    // "~" leads the internal selection-state namespace (e.g. the per-group
    // write-in keys core stores as "~writeIn:<groupId>") — a group id there
    // would collide with that state.
    if (g.id.startsWith("~"))
      errs.push(`group id "${g.id}" must not start with "~" (reserved for internal selection-state keys)`);
    if (!g.locked && g.options.length < 2)
      errs.push(
        `group "${g.id}" has ${g.options.length} option(s) — open groups need at least 2 (or set locked: true)`,
      );
    if (g.locked && !g.options.some((o) => o.recommended))
      errs.push(`locked group "${g.id}" needs a recommended option to hold its fixed pick`);
    if (g.locked && g.allowWriteIn === true)
      errs.push(`locked group "${g.id}" cannot allow a write-in (locked groups are decided context)`);
    const optIds = new Set<string>();
    for (const o of g.options) {
      if (optIds.has(o.id))
        errs.push(`duplicate option id "${o.id}" in group "${g.id}"`);
      optIds.add(o.id);
      const refAsset = (a?: string) => {
        if (a && !cfg.assets[a])
          errs.push(`option "${g.id}.${o.id}" references missing asset "${a}"`);
      };
      const s = o.specimen;
      if (s.kind === "imageCrop") refAsset(s.asset);
      if (s.kind === "motion" || s.kind === "layoutMock") {
        refAsset(s.asset);
        refAsset(s.asset2);
      }
    }
  }
  if (cfg.preview) {
    for (const b of cfg.preview.bands) {
      if (!groupIds.has(b.fromGroup))
        errs.push(
          `preview band "${b.slot}" references missing group "${b.fromGroup}"`,
        );
    }
    if (cfg.preview.headlineFrom && !groupIds.has(cfg.preview.headlineFrom))
      errs.push(
        `preview.headlineFrom references missing group "${cfg.preview.headlineFrom}"`,
      );
  }
  return errs;
}
