/**
 * Brand Starter — a light, asset-free Loupe config that proves the picker
 * generalizes beyond image-heavy, photographic decision labs.
 *
 * Everything here is drawn with palette / type / layoutMock / motion specimens —
 * no moodboard PNGs, no `imageCrop` — so the artifact stays tiny and the example
 * runs anywhere. It also swaps in a completely different brand theme
 * ("Northwind", a warm amber-on-ink system) to show the bring-your-own-brand
 * theming contract re-skinning the same machinery.
 *
 * Use this as the template when you are deciding a brand's *system* (color,
 * type, layout rhythm, motion) rather than choosing photographic art direction.
 */
import type { Config } from "@lucentive-labs/loupe-schema";

const SANS = "Manrope, ui-sans-serif, system-ui, sans-serif";
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";

export const config: Config = {
  version: 1,
  title: "Northwind · Brand System Starter",
  // No image assets — every specimen is palette / type / layoutMock / motion.
  assets: {},
  // A distinct brand theme (warm amber on near-black ink) mapped onto the
  // semantic --loupe-* contract — a deliberately different, warmer brand than the calm
  // ivory/teal theme — same library, different brand.
  theme: {
    "color-bg": "#14110e",
    "color-surface": "#1d1813",
    "color-fg": "#f7efe3",
    "color-fg-muted": "#b3a48f",
    "color-primary": "#f6a13c",
    "color-primary-fg": "#1a1408",
    "color-border": "#2c241b",
    "color-ring": "#f6a13c",
    "color-danger": "#e2603f",
    "color-signal": "#ffc879",
    "radius-sm": "6px",
    "radius-md": "10px",
    "radius-lg": "16px",
    "font-sans": SANS,
    "font-serif": SERIF,
  },
  preview: {
    bands: [
      { slot: "headline", fromGroup: "headline", as: "headline" },
      { slot: "hero", fromGroup: "hero", as: "feature" },
      { slot: "color", fromGroup: "color", as: "swatch" },
      { slot: "motion", fromGroup: "motion", as: "band" },
    ],
    headlineFrom: "headline",
  },
  groups: [
    {
      id: "color",
      title: "Color system",
      // The step's headline question: the title demotes to a small-caps
      // eyebrow and this becomes the visual ask.
      question: "Which palette carries the brand?",
      // Long context collapses behind a "Full context" toggle; the one-line
      // lead stays visible so the ask is never buried.
      promptLead: "Pick the palette every Northwind surface will carry.",
      prompt:
        "Northwind sells premium field equipment to people who read the spec sheet before the story. The palette has to work on packaging, a dense product-configurator UI, and long-form journal posts — the same four colors everywhere. Warmth signals craft; restraint signals engineering. Whatever you pick here locks the accent used for every call-to-action downstream.",
      promptCollapsible: true,
      options: [
        {
          id: "amberInk",
          label: "Amber on ink",
          caption: "Warm, premium, high-contrast",
          recommended: true,
          specimen: { kind: "palette", colors: ["#14110e", "#f6a13c", "#ffc879", "#f7efe3"] },
        },
        {
          id: "sageStone",
          label: "Sage & stone",
          caption: "Quiet, editorial, natural",
          specimen: { kind: "palette", colors: ["#2c2f28", "#8a9a7b", "#c9c2b2", "#f2efe8"] },
        },
        {
          id: "monoSignal",
          label: "Mono + one signal",
          caption: "Restrained, system-like",
          specimen: { kind: "palette", colors: ["#101216", "#3a4048", "#9aa3ad", "#f6a13c"] },
        },
      ],
    },
    {
      id: "headline",
      title: "Headline voice",
      question: "Which type voice?",
      prompt: "What does the type say before the words do?",
      options: [
        {
          id: "boldSans",
          label: "Bold humanist sans",
          recommended: true,
          specimen: { kind: "type", family: SANS, weight: 800, sample: "Build the northwind." },
        },
        {
          id: "editorialSerif",
          label: "Editorial serif",
          specimen: {
            kind: "type",
            family: SERIF,
            weight: 500,
            sample: "A warmer way to ship.",
            kicker: "Field note",
          },
        },
        {
          id: "quietLabel",
          label: "Quiet operational",
          specimen: {
            kind: "type",
            family: SANS,
            weight: 600,
            sample: "Direction · System · Proof",
            kicker: "Operational",
          },
        },
      ],
    },
    {
      id: "hero",
      title: "Hero layout",
      prompt: "How does the first screen open?",
      options: [
        {
          id: "portrait",
          label: "Statement portrait",
          recommended: true,
          // layoutMock with no asset renders a clean wireframe diagram — perfect
          // for deciding layout rhythm without committing to imagery yet.
          specimen: { kind: "layoutMock", plan: "portrait" },
        },
        {
          id: "sparse",
          label: "Sparse, text-led",
          specimen: { kind: "layoutMock", plan: "sparse" },
        },
        {
          id: "chapters",
          label: "Chaptered index",
          specimen: { kind: "layoutMock", plan: "chapters" },
        },
      ],
    },
    {
      id: "motion",
      title: "Motion feel",
      prompt: "What does movement feel like?",
      options: [
        {
          id: "breathe",
          label: "Slow breathing",
          recommended: true,
          // Motion presets are a fixed safe enum; asset-free here, so they show
          // as motion-framed placeholders (the *feel*, not the photo).
          specimen: { kind: "motion", preset: "breathe" },
        },
        { id: "pan", label: "Lateral pan", specimen: { kind: "motion", preset: "pan" } },
        { id: "field", label: "Responsive field", specimen: { kind: "motion", preset: "field" } },
      ],
    },
    {
      id: "density",
      title: "Information density",
      prompt: "How much sits on one screen?",
      options: [
        {
          id: "airy",
          label: "Airy",
          recommended: true,
          specimen: { kind: "layoutMock", plan: "belowfold" },
        },
        { id: "stacked", label: "Stacked", specimen: { kind: "layoutMock", plan: "stack" } },
      ],
    },
  ],
  banned: [
    "Generic SaaS gradient blobs and abstract 3D shapes.",
    "Cold corporate blue as the primary brand color.",
    "Cluttered first screens with no clear hierarchy.",
  ],
  notes: [
    "This is a system-decision starter: choose color, type, layout, and motion before any imagery exists.",
    "Pick one tile per group; the composed preview and export brief stay in sync for the build pass.",
  ],
};

export default config;
