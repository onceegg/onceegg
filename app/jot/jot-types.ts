export const JOT_COLORS = [
  "saffron",
  "cornflower",
  "coral",
  "sage",
  "violet",
  "apricot",
  "teal",
  "rose",
  "lime",
  "indigo",
  "terra",
  "sky",
  "plum",
  "gold",
  "emerald",
  "lilac",
  "vermilion",
  "olive",
  "cerulean",
  "pink",
  "ochre",
  "mint",
  "iris",
] as const;

export type JotColor = (typeof JOT_COLORS)[number];

export type JotNote = {
  id: string;
  text: string;
  color: JotColor;
  isCompleted: boolean;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type JotState = {
  notes: JotNote[];
  nextColorIndex: number;
};

export const JOT_PALETTE: Record<JotColor, { surface: string; ink: string }> = {
  saffron: { surface: "#EACF82", ink: "#241F18" },
  cornflower: { surface: "#A9C7E8", ink: "#1D2228" },
  coral: { surface: "#E7AEA5", ink: "#261D1A" },
  sage: { surface: "#B7CBAA", ink: "#1F241C" },
  violet: { surface: "#C5B5DA", ink: "#211D27" },
  apricot: { surface: "#EDC096", ink: "#261F19" },
  teal: { surface: "#A3D0CA", ink: "#1B2422" },
  rose: { surface: "#DDB4C1", ink: "#261D21" },
  lime: { surface: "#CEDB9D", ink: "#22251A" },
  indigo: { surface: "#AEB6DA", ink: "#1D2028" },
  terra: { surface: "#D5AE9E", ink: "#251E1A" },
  sky: { surface: "#AED7E4", ink: "#1B2326" },
  plum: { surface: "#CBB1C4", ink: "#251E24" },
  gold: { surface: "#E1C88D", ink: "#252016" },
  emerald: { surface: "#A8CCB6", ink: "#1C231F" },
  lilac: { surface: "#D3C4E2", ink: "#211E26" },
  vermilion: { surface: "#E7A39A", ink: "#271C19" },
  olive: { surface: "#C6C69B", ink: "#232319" },
  cerulean: { surface: "#9BC8DE", ink: "#1B2226" },
  pink: { surface: "#E8C0CA", ink: "#261F21" },
  ochre: { surface: "#D8BB8C", ink: "#251F17" },
  mint: { surface: "#B9D8C9", ink: "#1D2420" },
  iris: { surface: "#BEB6D8", ink: "#201E27" },
};

export const EMPTY_JOT_STATE: JotState = {
  notes: [],
  nextColorIndex: 0,
};
