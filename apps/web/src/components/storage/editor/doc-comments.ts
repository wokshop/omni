import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { MarkedThread, TextAnchor } from "@/lib/storage-comments.ts";

interface Range {
  id: string;
  from: number;
  to: number;
}

const CONTEXT = 32;

function flatten(doc: PmNode) {
  let text = "";
  const at: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      text += node.text;
      for (let i = 0; i < node.nodeSize; i++) at.push(pos + i);
      return false;
    }
    if (node.isTextblock && text && !text.endsWith("\n")) {
      text += "\n";
      at.push(-1);
    }
    return true;
  });
  return { text, at };
}

/** The passage from `from` to `to`, kept by its words and what is around them; null if it is blank. */
export function textAnchorOf(doc: PmNode, from: number, to: number) {
  const { text, at } = flatten(doc);
  let start = at.findIndex((pos) => pos >= from);
  let end = at.findLastIndex((pos) => pos !== -1 && pos < to) + 1;
  if (start === -1 || end <= start) return null;
  while (start < end && /\s/.test(text[start] ?? "")) start++;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end--;
  if (end <= start) return null;
  const anchor: TextAnchor = {
    kind: "text",
    quote: text.slice(start, end).slice(0, 2_000),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
  return anchor;
}

const sharedEnd = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};

const sharedStart = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

function occurrences(text: string, words: string) {
  const found: number[] = [];
  for (let i = text.indexOf(words); i !== -1; i = text.indexOf(words, i + 1)) found.push(i);
  return found;
}

interface Found {
  start: number;
  end: number;
  fit: number;
}

function exact(text: string, anchor: TextAnchor) {
  let best: Found | null = null;
  for (const i of occurrences(text, anchor.quote)) {
    const end = i + anchor.quote.length;
    const fit =
      sharedEnd(text.slice(0, i), anchor.prefix) + sharedStart(text.slice(end), anchor.suffix);
    if (!best || fit > best.fit) best = { start: i, end, fit };
  }
  return best;
}

const EDGE = 12;
const MIN_EDGE = 4;

const tail = (prefix: string) => prefix.slice(-EDGE).split("\n").at(-1) ?? "";
const head = (suffix: string) => suffix.slice(0, EDGE).split("\n")[0] ?? "";

function startsOf(text: string, prefix: string) {
  const starts = prefix.length < CONTEXT && text.startsWith(prefix) ? [prefix.length] : [];
  const before = tail(prefix);
  if (before.length < MIN_EDGE) return starts;
  return [...starts, ...occurrences(text, before).map((i) => i + before.length)];
}

function endFrom(text: string, suffix: string, start: number) {
  const after = head(suffix);
  const near = after.length < MIN_EDGE ? -1 : text.indexOf(after, start);
  if (near !== -1 || suffix.length >= CONTEXT || !text.endsWith(suffix)) return near;
  return text.length - suffix.length;
}

function between(text: string, anchor: TextAnchor) {
  const fit = Math.min(anchor.prefix.length, EDGE) + Math.min(anchor.suffix.length, EDGE);
  for (const start of startsOf(text, anchor.prefix)) {
    const end = endFrom(text, anchor.suffix, start);
    if (end > start && end - start <= anchor.quote.length * 2 + 20) {
      const found: Found = { start, end, fit };
      return found;
    }
  }
  return null;
}

function locate(text: string, anchor: TextAnchor) {
  const same = exact(text, anchor);
  const near = between(text, anchor);
  if (!near) return same;
  return same && same.fit >= near.fit ? same : near;
}

/** Where each thread's passage is in the doc now; a thread whose passage is gone is left out. */
export function placeThreads(doc: PmNode, threads: MarkedThread[]) {
  const { text, at } = flatten(doc);
  const ranges: Range[] = [];
  for (const thread of threads) {
    const found = locate(text, thread.anchor);
    const from = found ? at[found.start] : undefined;
    const last = found ? at[found.end - 1] : undefined;
    if (from === undefined || last === undefined || from < 0 || last < 0) continue;
    ranges.push({ id: thread.id, from, to: last + 1 });
  }
  return ranges;
}

interface Marks {
  threads: MarkedThread[];
  active: string | null;
  ranges: Range[];
  decorations: DecorationSet;
}

const key = new PluginKey<Marks>("docComments");

function marksOf(state: Pick<EditorState, "doc">, threads: MarkedThread[], active: string | null) {
  const ranges = placeThreads(state.doc, threads);
  const decorations = DecorationSet.create(
    state.doc,
    ranges.map((range) =>
      Decoration.inline(range.from, range.to, {
        class: range.id === active ? "doc-comment doc-comment-active" : "doc-comment",
        "data-comment": range.id,
      }),
    ),
  );
  const marks: Marks = { threads, active, ranges, decorations };
  return marks;
}

/** Where a thread's passage is in the editor now, if it is still there. */
export function threadRange(state: EditorState, id: string) {
  return key.getState(state)?.ranges.find((range) => range.id === id) ?? null;
}

/**
 * Comments on a doc's text: each open thread's passage is marked, found again by its words after
 * every change (so a co-editor's typing never loses it), and a click on one picks its thread.
 */
export const DocComments = Extension.create<{ onPick: (id: string) => void }>({
  name: "docComments",
  addOptions: () => ({ onPick: () => {} }),
  addProseMirrorPlugins() {
    const { onPick } = this.options;
    return [
      new Plugin<Marks>({
        key,
        state: {
          init: (_config, state) => marksOf(state, [], null),
          apply: (tr, marks, _old, state) => {
            const next = tr.getMeta(key) as Pick<Marks, "threads" | "active"> | undefined;
            if (next) return marksOf(state, next.threads, next.active);
            return tr.docChanged ? marksOf(state, marks.threads, marks.active) : marks;
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
          handleClick: (view, pos) => {
            const ranges = key.getState(view.state)?.ranges ?? [];
            const hit = ranges
              .filter((range) => range.id !== "pending" && range.from <= pos && pos <= range.to)
              .toSorted((a, b) => a.to - a.from - (b.to - b.from))[0];
            if (hit) onPick(hit.id);
            return false;
          },
        },
      }),
    ];
  },
});

/** Shows these threads in the doc, with `active` picked out. */
export function showThreads(
  view: { state: EditorState; dispatch: (tr: EditorState["tr"]) => void },
  threads: MarkedThread[],
  active: string | null,
) {
  view.dispatch(view.state.tr.setMeta(key, { threads, active }).setMeta("addToHistory", false));
}
