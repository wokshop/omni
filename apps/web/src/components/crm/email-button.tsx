import { useState } from "react";
import { NewMessageComposer } from "@/components/compose/composer";
import { useComposeMailboxes } from "@/components/compose/compose-pane";
import { reopenCompose } from "@/hooks/use-compose-pane.ts";
import { IconMail } from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import type { CrmPerson } from "@/lib/crm.ts";

/**
 * A record header's Email: the compact new-message composer dropping down from the button,
 * addressed to the record's people (each one's primary address). Sending closes it.
 */
export function EmailButton(props: { people: CrmPerson[] }) {
  const [open, setOpen] = useState(false);
  const mailboxes = useComposeMailboxes();
  const to = props.people
    .map((person) => (person.addresses.find((a) => a.isPrimary) ?? person.addresses[0])?.address)
    .filter(Boolean)
    .join(", ");
  return (
    <PopoverTrigger isOpen={open} onOpenChange={setOpen}>
      <Button intent="outline" size="sm">
        <IconMail data-slot="icon" />
        Email
      </Button>
      <Popover
        placement="bottom end"
        aria-label="New email"
        className="h-[min(--spacing(120),calc(100dvh-6rem))] w-[min(--spacing(140),calc(100vw-2rem))] max-w-none overflow-hidden"
      >
        {open && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none">
            <NewMessageComposer
              mailboxes={mailboxes}
              initial={{ to }}
              onSent={() => setOpen(false)}
              onUndone={reopenCompose}
            />
          </div>
        )}
      </Popover>
    </PopoverTrigger>
  );
}
