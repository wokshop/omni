// Text and code files edited as text (ADR 0043): CodeMirror, saving exactly what was typed. Its
// own chunk, loaded when such a file is edited.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { quoteOf, type EditorSelection } from "./comment-toolbar.tsx";
import type { EditorProps } from "./document-editor.tsx";

/** The preview's look: its 13/20 mono text, its gutter, the app's tokens. */
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    lineHeight: "20px",
    overscrollBehavior: "contain",
  },
  ".cm-content": { padding: "16px 0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0 20px 0 0" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--subtle-foreground)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 16px 0 20px" },
  ".cm-activeLine": { backgroundColor: "var(--secondary)" },
});

/** The chosen text's lines (a choice ending at a line's start leaves that line out). */
function selectionOf(view: EditorView): EditorSelection | null {
  const { from, to } = view.state.selection.main;
  const quote = quoteOf(view.state.sliceDoc(from, to));
  if (!view.hasFocus || !quote) return null;
  const { doc } = view.state;
  return {
    quote,
    lines: () => ({
      start: doc.lineAt(from).number,
      end: doc.lineAt(Math.max(from, to - 1)).number,
    }),
    rect: () => {
      const at = view.coordsAtPos(from);
      const box = view.scrollDOM.getBoundingClientRect();
      return at && at.top >= box.top && at.top <= box.bottom ? at : null;
    },
  };
}

/** The editor's accessible name, which follows the file's name. */
const label = new Compartment();

export default function SourceEditor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const { onReady, onChange, name, text } = props;
  // The callbacks may change between renders; the view is made once.
  const latest = useRef(onChange);
  const selecting = useRef(props.onSelection);
  useEffect(() => {
    latest.current = onChange;
    selecting.current = props.onSelection;
  });
  const view = useRef<EditorView | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const made = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorState.tabSize.of(2),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          label.of(EditorView.contentAttributes.of({ "aria-label": name })),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current();
            if (update.docChanged || update.selectionSet || update.focusChanged) {
              selecting.current?.(selectionOf(update.view));
            }
          }),
          theme,
        ],
      }),
    });
    made.focus();
    onReady(() => made.state.doc.toString());
    view.current = made;
    return () => {
      view.current = null;
      made.destroy();
    };
    // Made once per text: a rename relabels it below, and never drops what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, onReady]);
  useEffect(() => {
    view.current?.dispatch({
      effects: label.reconfigure(EditorView.contentAttributes.of({ "aria-label": name })),
    });
  }, [name]);
  return <div ref={host} className="min-h-0 flex-1" />;
}
