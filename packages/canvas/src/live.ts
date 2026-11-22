import * as Y from "yjs";
import { keyBetween, keysAfter } from "./order.ts";
import { copy, elementSchema, FIELDS, type CanvasElement, type Scene } from "./scene.ts";
import { paintOrder, type Keyed } from "./tree.ts";

const ELEMENTS = "elements";

type YElement = Y.Map<unknown>;

const elementsOf = (doc: Y.Doc) => doc.getMap<YElement>(ELEMENTS);

function readElement(id: string, fields: YElement) {
  const raw: Record<string, unknown> = { id };
  for (const [key, value] of fields.entries()) {
    if (key !== "z") raw[key] = value instanceof Y.Text ? value.toString() : value;
  }
  const parsed = elementSchema.safeParse(raw);
  if (!parsed.success) return null;
  const z = fields.get("z");
  const keyed: Keyed = { element: parsed.data, z: typeof z === "string" ? z : "" };
  return keyed;
}

function readAll(doc: Y.Doc) {
  const found = new Map<string, Keyed>();
  for (const [id, fields] of elementsOf(doc).entries()) {
    if (!(fields instanceof Y.Map)) continue;
    const keyed = readElement(id, fields);
    if (keyed) found.set(id, keyed);
  }
  return found;
}

/**
 * The scene the live document holds now, repaired into a valid one (`paintOrder`). The document
 * is one map from element id to that element's fields: each field its own last-writer-wins value
 * (`box` whole, so two moves never mix), text a `Y.Text` that merges by character, and `z` the
 * element's order among its siblings.
 */
export function liveScene(doc: Y.Doc) {
  const scene: Scene = { elements: paintOrder([...readAll(doc).values()]) };
  return scene;
}

function writeField(fields: YElement, field: (typeof FIELDS)[number], value: unknown) {
  if (value === undefined) {
    if (fields.has(field)) fields.delete(field);
  } else if (field === "text") {
    fields.set(field, new Y.Text(value as string));
  } else {
    fields.set(field, copy(value));
  }
}

function newFields(element: CanvasElement, z: string) {
  const fields: YElement = new Y.Map();
  for (const field of FIELDS) {
    if (field !== "id" && element[field] !== undefined) writeField(fields, field, element[field]);
  }
  fields.set("z", z);
  return fields;
}

function retype(text: Y.Text, next: string) {
  const now = text.toString();
  if (now === next) return;
  let start = 0;
  while (start < now.length && start < next.length && now[start] === next[start]) start++;
  let end = 0;
  while (
    end < now.length - start &&
    end < next.length - start &&
    now[now.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }
  text.delete(start, now.length - start - end);
  text.insert(start, next.slice(start, next.length - end));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function updateFields(fields: YElement, before: CanvasElement, after: CanvasElement) {
  for (const field of FIELDS) {
    if (field === "id" || same(before[field], after[field])) continue;
    const text = fields.get(field);
    if (field === "text" && text instanceof Y.Text && after.text !== undefined) {
      retype(text, after.text);
    } else {
      writeField(fields, field, after[field]);
    }
  }
}

function keysFor(scene: Scene, current: Map<string, Keyed>) {
  const siblings = new Map<string | undefined, CanvasElement[]>();
  for (const element of scene.elements) {
    siblings.set(element.parent, [...(siblings.get(element.parent) ?? []), element]);
  }
  const keys = new Map<string, string>();
  for (const [parent, list] of siblings) {
    const kept = (element: CanvasElement) => {
      const now = current.get(element.id);
      return now && now.element.parent === parent && now.z ? now.z : null;
    };
    const keptKeys = list.map(kept).filter((key) => key !== null);
    const inOrder = keptKeys.every((key, i) => i === 0 || keptKeys[i - 1]! < key);
    if (!inOrder) {
      const fresh = keysAfter(null, list.length);
      list.forEach((element, i) => keys.set(element.id, fresh[i]!));
      continue;
    }
    let previous: string | null = null;
    list.forEach((element, i) => {
      const own = kept(element);
      if (own) {
        keys.set(element.id, own);
        previous = own;
        return;
      }
      const next =
        list
          .slice(i + 1)
          .map(kept)
          .find((key) => key !== null) ?? null;
      previous = keyBetween(previous, next);
      keys.set(element.id, previous);
    });
  }
  return keys;
}

/** Fills an empty live document with `scene`: the start of a new epoch. */
export function seedCanvas(doc: Y.Doc, scene: Scene) {
  rewriteCanvas(doc, scene);
}

/**
 * Changes the live document to hold `scene` with the smallest change: elements it lacks are
 * deleted, new ones added, and of the rest only the fields that differ are set (text through a
 * character diff). Answers the change as an update the others merge, so whatever they changed
 * meanwhile that this did not touch is kept. Elements the document holds but cannot read (a
 * newer app's) are left as they are.
 */
export function rewriteCanvas(doc: Y.Doc, scene: Scene, origin?: unknown) {
  const before = Y.encodeStateVector(doc);
  const current = readAll(doc);
  const keys = keysFor(scene, current);
  doc.transact(() => {
    const elements = elementsOf(doc);
    const wanted = new Set(scene.elements.map((element) => element.id));
    for (const id of current.keys()) if (!wanted.has(id)) elements.delete(id);
    for (const element of scene.elements) {
      const z = keys.get(element.id)!;
      const now = current.get(element.id);
      const fields = elements.get(element.id);
      if (!now || !(fields instanceof Y.Map)) {
        elements.set(element.id, newFields(element, z));
        continue;
      }
      updateFields(fields, now.element, element);
      if (now.z !== z) fields.set("z", z);
    }
  }, origin);
  return Y.encodeStateAsUpdate(doc, before);
}
