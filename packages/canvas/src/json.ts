import {
  CANVAS_MAX_FILES,
  FIELDS,
  sceneFileSchema,
  type CanvasElement,
  type Scene,
} from "./scene.ts";

const round = (value: number) => Math.round(value * 100) / 100;

const rounded: (value: unknown) => unknown = (value) => {
  if (typeof value === "number") return round(value);
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, rounded(inner)]));
  }
  return value;
};

function elementLine(element: CanvasElement) {
  const fields: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const value = element[field];
    if (value !== undefined) fields[field] = rounded(value);
  }
  return JSON.stringify(fields);
}

/**
 * The canvas's body: the scene as JSON, one element per line in paint order, so a version diff
 * is a list of whole elements. Written the same way every time.
 */
export function sceneToJson(scene: Scene) {
  const lines = scene.elements.map((element) => `    ${elementLine(element)}`);
  const elements = lines.length ? `[\n${lines.join(",\n")}\n  ]` : "[]";
  return `{\n  "omni": "canvas",\n  "v": 1,\n  "elements": ${elements}\n}\n`;
}

export type SceneResult = { ok: true; scene: Scene } | { ok: false; error: string };

/** What is wrong with a scene beyond its schema (an id used twice, too many tiles), or null. */
export function sceneProblem(scene: Scene) {
  const ids = new Set<string>();
  let files = 0;
  for (const element of scene.elements) {
    if (ids.has(element.id)) return `Two elements share the id "${element.id}".`;
    ids.add(element.id);
    if (element.kind === "file") files++;
  }
  if (files > CANVAS_MAX_FILES) return `A canvas shows at most ${CANVAS_MAX_FILES} Drive files.`;
  return null;
}

const unread = (error: string) => {
  const result: SceneResult = { ok: false, error };
  return result;
};

/** Reads a canvas's body; an empty body is an empty canvas. */
export function sceneFromJson(text: string) {
  const empty: SceneResult = { ok: true, scene: { elements: [] } };
  if (!text.trim()) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return unread("The canvas is not JSON.");
  }
  const parsed = sceneFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    return unread(`The canvas does not read as a scene${where}: ${issue?.message}`);
  }
  const scene: Scene = { elements: parsed.data.elements };
  const problem = sceneProblem(scene);
  const read: SceneResult = problem ? { ok: false, error: problem } : { ok: true, scene };
  return read;
}
