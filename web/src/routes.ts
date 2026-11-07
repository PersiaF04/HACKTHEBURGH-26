// Deep-dive screens, in story order. The dashboard (#dashboard, an empty hash, or anything unknown) is the default route.
export const DEEP_DIVES = [
  { id: "waste", label: "The Waste" },
  { id: "iceberg", label: "Hidden Bill" },
  { id: "help", label: "Help Wanted" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "copilot", label: "Flex Copilot" },
  { id: "operator", label: "Be the Operator" },
  { id: "hood", label: "Under the Hood" },
] as const;
export type DeepDiveId = (typeof DEEP_DIVES)[number]["id"];
