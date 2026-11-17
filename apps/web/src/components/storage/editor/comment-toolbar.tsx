// A thread starts in the document (ADR 0043 decision 4): text chosen in the editor shows a
// toolbar over it, and its Comment opens a box there. The thread points at the chosen lines of the
// saved file, with the chosen text, so it is found again after edits.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChatBox } from "@/components/chat/chat-box";
import { IconComment } from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { popupSurface } from "@/components/ui/popover";
import { Toolbar } from "@/components/ui/toolbar";

/** What is chosen in the editor: its lines of the file's text, counted from 1, and where it is. */
export interface EditorSelection {
  quote: string;
  /** Read when the comment is sent: a page works its lines out of its whole Markdown. */
  lines: () => { start: number; end: number };
  /** Where its first line is on screen now; null once it is scrolled out of the editor. */
  rect: () => { top: number; left: number } | null;
}

/** The longest quote kept with a thread (the contract's limit). */
const QUOTE_MAX = 500;
export const quoteOf = (text: string) => text.trim().slice(0, QUOTE_MAX);

/** Repaints on any scroll or resize, so what floats over the text follows it. */
function useViewportTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const bump = () => setTick((tick) => tick + 1);
    window.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    return () => {
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
    };
  }, [active]);
}

export function CommentToolbar(props: {
  selection: EditorSelection | null;
  /** Sends the thread; resolves true once it is posted. */
  onSend: (body: string, selection: EditorSelection) => Promise<boolean>;
}) {
  // The selection the box was opened on: it stays while the box takes the focus.
  const [writing, setWriting] = useState<EditorSelection | null>(null);
  const at = writing ?? props.selection;
  const box = useRef<HTMLDivElement>(null);
  useViewportTick(at !== null);
  // A press anywhere else closes the box.
  useEffect(() => {
    if (!writing) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setWriting(null);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [writing]);
  const rect = at?.rect();
  if (!at || !rect) return null;
  return createPortal(
    <div
      ref={box}
      className="fixed z-50"
      style={{ top: rect.top - 8, left: rect.left, transform: "translateY(-100%)" }}
      // A press here keeps the editor's selection.
      onPointerDown={(event) => {
        if (!writing) event.preventDefault();
      }}
    >
      {writing ? (
        <CommentBox
          onCancel={() => setWriting(null)}
          onSend={async (body) => {
            const sent = await props.onSend(body, writing);
            if (sent) setWriting(null);
            return sent;
          }}
        />
      ) : (
        <Toolbar aria-label="Selection" className="shadow-(--shadow-overlay)">
          <Button intent="plain" size="sm" onPress={() => setWriting(at)}>
            <IconComment data-slot="icon" />
            Comment
          </Button>
        </Toolbar>
      )}
    </div>,
    document.body,
  );
}

function CommentBox(props: { onSend: (body: string) => Promise<boolean>; onCancel: () => void }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  useLayoutEffect(() => {
    textarea.current?.focus();
  }, []);
  const send = () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    void props.onSend(body).finally(() => setSending(false));
  };
  return (
    <div className={`w-80 p-1.5 ${popupSurface}`}>
      <ChatBox
        compact
        textareaRef={textarea}
        label="Comment"
        placeholder="Comment"
        sendLabel="Comment"
        canSend={text.trim().length > 0 && !sending}
        onSend={send}
        value={text}
        onChange={(next) => setText(next)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            props.onCancel();
          }
        }}
      />
    </div>
  );
}
