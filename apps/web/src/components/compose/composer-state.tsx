// Which composer the open conversation shows, shared by the timeline (each message's menu and
// actions, a selection's reply box) and the composer under it. Hidden is the team's side of a
// shared inbox: internal notes, written like a chat. Public is the email the customer gets: a
// reply or a forward. A shared inbox's composer is always there, in Hidden; Reply or Forward on a
// message turns it into the email composer, and a send or a discard turns it back. A personal
// thread has only Public, closed until Reply or Forward opens it and again after a discard.
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Reply } from "@/lib/reply.ts";

export type ComposerMode = "public" | "hidden";
/** Who a reply goes to: the latest sender, or everyone on the thread outside the team. */
export type ReplyKind = "reply" | "replyAll";

interface ComposerState {
  /** True on a shared inbox: Hidden exists. A personal thread only has Public. */
  chat: boolean;
  mode: ComposerMode;
  /** What the next hidden message replies to, shown as a banner in the chat box. */
  reply: Reply | undefined;
  /** Text handed over from a selection's reply box, to start the chat message with. */
  seed: { text: string } | undefined;
  /** Opens Hidden replying to `reply`, with `draft` (typed in the selection's box) as its text. */
  replyInChat: (reply: Reply, draft?: string) => void;
  clearReply: () => void;
  /** The message being forwarded; Public replies when there is none. */
  forwardId: string | undefined;
  forward: (messageId: string) => void;
  stopForward: () => void;
  /** Whether the composer shows: always on a shared inbox; from Reply or Forward on a personal one. */
  open: boolean;
  /** Whether the email composer is mounted: from Reply or Forward until a discard. */
  email: boolean;
  replyKind: ReplyKind;
  /** The message a reply answers; the latest when unset. */
  replyToId: string | undefined;
  /** Opens the email composer as a reply (to the sender, or to all), to `messageId` when given. */
  openReply: (kind: ReplyKind, messageId?: string) => void;
  /** After a discard: closes the email composer (back to Hidden on a shared inbox). */
  close: () => void;
  /** After an email is sent: a shared inbox goes back to Hidden, keeping the email composer
   * mounted so an undo can hand its text back. */
  sentEmail: () => void;
  /** Shows the email composer again (an undone send). */
  showEmail: () => void;
  /** Changes on every close, so the next composer starts empty. */
  generation: number;
}

const Context = createContext<ComposerState | null>(null);

/** One per open conversation (keyed by thread), so nothing carries over to the next one. */
export function ComposerProvider({ chat, children }: { chat: boolean; children: ReactNode }) {
  const [mode, setMode] = useState<ComposerMode>(chat ? "hidden" : "public");
  const [reply, setReply] = useState<Reply>();
  const [seed, setSeed] = useState<{ text: string }>();
  const [forwardId, setForwardId] = useState<string>();
  const [replyToId, setReplyToId] = useState<string>();
  const [email, setEmail] = useState(false);
  // A shared inbox writes to everyone outside the team by default, as it always did.
  const [replyKind, setReplyKind] = useState<ReplyKind>(chat ? "replyAll" : "reply");
  const [generation, setGeneration] = useState(0);
  const showing = email && (!chat || mode === "public");
  // Reply or Forward while the email composer isn't in view starts a fresh one, so it answers
  // the thread as it is now, not as it was at the last send.
  const startEmail = () => {
    if (!showing) setGeneration((n) => n + 1);
    setEmail(true);
    setMode("public");
  };
  const value: ComposerState = {
    chat,
    // A personal thread opened in the same reader has no chat.
    mode: chat ? mode : "public",
    reply,
    seed,
    replyInChat: (next, draft) => {
      setReply(next);
      // A new object each time, so the same words handed over twice still arrive.
      if (draft) setSeed({ text: draft });
      setMode("hidden");
    },
    clearReply: () => setReply(undefined),
    forwardId,
    forward: (messageId) => {
      setForwardId(messageId);
      startEmail();
    },
    stopForward: () => setForwardId(undefined),
    open: chat || email,
    email,
    replyKind,
    replyToId,
    openReply: (kind, messageId) => {
      setReplyKind(kind);
      // Switching Reply and Reply all keeps the message it answers.
      if (messageId) setReplyToId(messageId);
      setForwardId(undefined);
      startEmail();
    },
    close: () => {
      setForwardId(undefined);
      setEmail(false);
      if (chat) setMode("hidden");
      setGeneration((n) => n + 1);
    },
    sentEmail: () => {
      if (chat) setMode("hidden");
    },
    showEmail: () => setMode("public"),
    generation,
  };
  return <Context value={value}>{children}</Context>;
}

export function useComposerState() {
  const state = useContext(Context);
  if (!state) throw new Error("useComposerState needs a ComposerProvider");
  return state;
}
