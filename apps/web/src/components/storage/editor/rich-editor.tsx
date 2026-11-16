// A Markdown file as a page (ADR 0043): Tiptap edits headings, lists, checklists, quotes, code
// and links, and saves the page back as Markdown. Its own chunk, loaded when a .md file is edited.
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useMemo } from "react";
import type { EditorProps } from "./document-editor.tsx";
import "./rich-editor.css";

/**
 * One list for every editor. Options that change identity between renders (a new array, a new
 * `editorProps`) make Tiptap reapply them all, which resets the caret to the editor's last known
 * selection: a click whose selection it has not read yet is undone.
 */
const EXTENSIONS = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Markdown,
];

export default function RichEditor(props: EditorProps) {
  const { onReady, onChange, name } = props;
  const editorProps = useMemo(
    () => ({ attributes: { class: "document-page", "aria-label": name } }),
    [name],
  );
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: props.text,
    contentType: "markdown",
    editorProps,
    onUpdate: () => onChange(),
    // Ready to type at the start (a new document's selection) once it is up, unless the person
    // already clicked into it. ProseMirror's own focus, at once: Tiptap's `autofocus` and focus
    // command finish on a later frame, after a quick click, and move the caret back.
    onCreate: ({ editor: created }) => {
      if (!created.view.dom.contains(document.activeElement)) created.view.focus();
    },
  });
  useEffect(() => {
    onReady(() => editor.getMarkdown());
  }, [editor, onReady]);

  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
      <EditorContent editor={editor} />
    </div>
  );
}
