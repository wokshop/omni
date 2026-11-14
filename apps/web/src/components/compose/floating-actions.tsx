// The page's primary action, floating at its bottom right: Compose over the list, Reply and
// Forward over an open thread. Compose is also a plain link in the sidebar.
import type { ReactNode } from "react";
import { IconForward, IconPencil, IconReply } from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { ariaKeyShortcuts } from "@/lib/shortcuts.ts";
import type { Thread } from "@/lib/types.ts";
import { useComposerState } from "./composer-state.tsx";

// Raised over whatever scrolls under it: the overlay shadow, as a menu or popover would.
const FLOAT = "shadow-(--shadow-overlay)";

/** New mail, pinned to the window's bottom right while nothing is open. */
export function FloatingCompose({ onPress }: { onPress: () => void }) {
  return (
    <div className="fixed end-5 bottom-5 z-20">
      <Button
        intent="primary"
        size="md"
        className={FLOAT}
        aria-keyshortcuts={ariaKeyShortcuts("compose")}
        onPress={onPress}
      >
        <IconPencil />
        Compose
      </Button>
    </div>
  );
}

/**
 * Reply and Forward for the open thread, in Compose's place: at the reading pane's bottom right,
 * riding on the docked composer when one shows. Gone while the email composer is open, which
 * holds Send instead.
 */
export function FloatingReply({ thread }: { thread: Thread }) {
  const composer = useComposerState();
  const latest = thread.messages.at(-1);
  if (!latest || (composer.email && composer.mode === "public")) return null;
  return (
    <Floating>
      <Button
        intent="outline"
        size="md"
        className={FLOAT}
        onPress={() => composer.forward(latest.id)}
      >
        <IconForward />
        Forward
      </Button>
      <Button
        intent="primary"
        size="md"
        className={FLOAT}
        // A shared inbox answers everyone outside the team, as a message's own Reply does.
        onPress={() => composer.openReply(composer.chat ? "replyAll" : "reply")}
      >
        <IconReply />
        Reply
      </Button>
    </Floating>
  );
}

/** Sits 20px over the top of its (sticky, bottom) parent and 20px in from its end. */
function Floating({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute end-5 bottom-full z-20 mb-5 flex gap-2 *:pointer-events-auto">
      {children}
    </div>
  );
}
