// Text and code files edited as text (ADR 0043): CodeMirror, saving exactly what was typed. Its
// own chunk, loaded when such a file is edited.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
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

export default function SourceEditor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const { onReady, onChange, name, text } = props;
  // The callbacks may change between renders; the view is made once.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
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
          EditorView.contentAttributes.of({ "aria-label": name }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current();
          }),
          theme,
        ],
      }),
    });
    view.focus();
    onReady(() => view.state.doc.toString());
    return () => view.destroy();
  }, [text, name, onReady]);
  return <div ref={host} className="min-h-0 flex-1" />;
}
