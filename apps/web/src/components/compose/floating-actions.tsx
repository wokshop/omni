// Reply and Forward, floating at the reading column's bottom right over an open thread; Compose,
// at the list's bottom right while no thread is open (with one open, the list header's pen).
import { verificationCode } from "@omni/mail-core/verification-code";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, type Ref, useMemo, useRef, useState } from "react";
import {
  IconBellOff,
  IconCheck,
  IconCopy,
  IconForward,
  IconPencil,
  IconReply,
} from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { appToast } from "@/components/ui/toast";
import { useClipboard } from "@/hooks/use-clipboard";
import { api, call, idempotencyKey } from "@/lib/api.ts";
import type { Thread } from "@/lib/types.ts";
import { useComposerState } from "./composer-state.tsx";

// Raised over whatever scrolls under it: the overlay shadow, as a menu or popover would.
const FLOAT = "shadow-(--shadow-overlay)";

/**
 * Reply and Forward for the open thread, at the reading pane's bottom right. Gone while a
 * composer is docked there (an email, or a shared conversation's hidden notes).
 *
 * On a sign-in or verification email the main action is Copy code instead: nobody answers
 * those. Reply and Forward move into a Respond menu beside it.
 *
 * Mail from a list (List-Unsubscribe) leads with Unsubscribe.
 */
export function FloatingReply({ thread, messageId }: { thread: Thread; messageId?: string }) {
  const composer = useComposerState();
  // The email on screen, in the email view; the latest otherwise.
  const latest = thread.messages.find((m) => m.id === messageId) ?? thread.messages.at(-1);
  // Back once no composer shows: also after a send from the email view, whose notes stay away.
  const composing = composer.chatOpen || (composer.email && composer.mode === "public");
  const pair = useRef<HTMLDivElement>(null);
  // Both buttons as one box, read when the menu places itself.
  const pairBox = useMemo(
    () => ({ getBoundingClientRect: () => pair.current?.getBoundingClientRect() ?? new DOMRect() }),
    [],
  );
  const code = useMemo(
    () =>
      latest && !latest.fromTeam
        ? verificationCode({ subject: latest.subject, text: latest.cleanText })
        : null,
    [latest],
  );
  if (!latest || composing) return null;
  // A shared inbox answers everyone outside the team, as a message's own Reply does.
  const reply = () => composer.openReply(composer.chat ? "replyAll" : "reply", messageId);
  const forward = () => composer.forward(latest.id);
  const unsubscribe = latest.unsubscribe && (
    <Unsubscribe
      key={latest.id}
      threadId={thread.id}
      messageId={latest.id}
      option={latest.unsubscribe}
    />
  );
  if (code) {
    return (
      <Floating ref={pair}>
        {unsubscribe}
        <MenuTrigger>
          <Button intent="outline" size="md" className={FLOAT}>
            <IconReply />
            Respond
          </Button>
          {/* Over the pair: from Respond's start edge, as wide as both buttons. */}
          <Menu
            placement="top start"
            popover={{ anchor: pairBox, className: "w-(--anchor-width)" }}
          >
            <MenuItem textValue="Reply" onAction={reply}>
              <IconReply data-slot="icon" />
              <MenuLabel>Reply</MenuLabel>
            </MenuItem>
            <MenuItem textValue="Forward" onAction={forward}>
              <IconForward data-slot="icon" />
              <MenuLabel>Forward</MenuLabel>
            </MenuItem>
          </Menu>
        </MenuTrigger>
        <CopyCode code={code} />
      </Floating>
    );
  }
  return (
    <Floating>
      {unsubscribe}
      <Button intent="outline" size="md" className={FLOAT} onPress={forward}>
        <IconForward />
        Forward
      </Button>
      <Button intent="primary" size="md" className={FLOAT} onPress={reply}>
        <IconReply />
        Reply
      </Button>
    </Floating>
  );
}

/** Puts the code on the clipboard; its icon is a check for a moment after, as a snippet's is. */
function CopyCode({ code }: { code: string }) {
  const { copy, copied } = useClipboard();
  return (
    <Button intent="primary" size="md" className={FLOAT} onPress={() => copy(code)}>
      {copied ? <IconCheck /> : <IconCopy />}
      Copy code
    </Button>
  );
}

/**
 * Leaves the list. One-click and mailto lists are done by the API; a list that only offers a page
 * opens it in a new tab. Once done the button stays, disabled, as Unsubscribed.
 */
function Unsubscribe({
  threadId,
  messageId,
  option,
}: {
  threadId: string;
  messageId: string;
  option: NonNullable<Thread["messages"][number]["unsubscribe"]>;
}) {
  // One per message: a retry of the same press never mails the list twice.
  const [key] = useState(idempotencyKey);
  const leave = useMutation({
    mutationFn: () =>
      call(
        api.threads[":id"].unsubscribe.$post({
          param: { id: threadId },
          header: { "idempotency-key": key },
          json: { messageId },
        }),
      ),
    onError: () => appToast.error("Unsubscribe failed"),
  });
  const press = () => {
    if (option.url) window.open(option.url, "_blank", "noopener,noreferrer");
    else leave.mutate();
  };
  const done = leave.isSuccess;
  return (
    <Button
      intent="danger"
      size="md"
      className={FLOAT}
      isPending={leave.isPending}
      isDisabled={done}
      onPress={press}
    >
      {done ? <IconCheck /> : <IconBellOff />}
      {done ? "Unsubscribed" : "Unsubscribe"}
    </Button>
  );
}

/** New mail, at the list's bottom right, where Reply sits once a thread opens. */
export function FloatingCompose({ onPress }: { onPress: () => void }) {
  return (
    <div className="pointer-events-none absolute end-5 bottom-5 z-20 flex *:pointer-events-auto">
      <Button intent="primary" size="md" className={FLOAT} onPress={onPress}>
        <IconPencil />
        Compose
      </Button>
    </div>
  );
}

/** Sits 20px over the top of its (sticky, bottom) parent and 20px in from its end. */
function Floating({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute end-5 bottom-full z-20 mb-5 flex gap-2 *:pointer-events-auto"
    >
      {children}
    </div>
  );
}
