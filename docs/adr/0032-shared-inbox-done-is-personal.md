# 0032: On a shared inbox, Done is personal and the ticket lives in the rail

Date: 2026-11-14 · Status: accepted · Supersedes: ADR 0031 decisions 2, 3 and 5 · Amends: ADR 0030
decision 4

## Context

ADR 0031 made Done and Later per member on shared conversations, and filtered each member's Inbox
to what "concerns" them: open and unassigned or theirs, or pending and theirs. In use that coupled
two things Rodrigo wants apart. A teammate taking or answering a conversation hid it from
everyone else, though whether you are finished with a conversation is your own call. The hand-off
(ADR 0030) did the same: moving a conversation to your personal mailbox assigned and resolved it,
so it left the team's view.

The ticket model itself (status, owner, priority, tags, SLA, reports) was never the problem, and
is kept for teams that grow into it. What changes is where it shows and what it may hide.

The conversation toolbar also changed with the kind of thread: Resolve and Snooze on a shared
conversation, Archive on a personal one. The same place on screen meant different things.

Rodrigo decided (Nov 14, 2026):

## Decision

1. **Done and Later are the only things that take a conversation out of your Inbox.** A shared
   conversation stays in each teammate's Inbox, list and counts, until that teammate marks it
   done or moves it to Later, whoever owns it, whatever its status, whoever replied. The views go
   back to the ADR 0007 rule (not archived, not done, not in Later) with no ticket filter. Resolve
   still files the mail on the server (ADR 0021), so a resolved conversation leaves every Inbox
   once that archive lands.
2. **The toolbar is the same on every thread**: Done, Later, read state, full screen. Resolve,
   Snooze and Archive are not in it.
3. **The rail under the title is the shared ticket**: status (Reopen, Resolve, Snooze), owner,
   priority and tags, each a menu, as before. The team's Snooze uses its own glyph
   (`IconClockSnooze`), so it is not mistaken for your Later.
4. **The sidebar keeps Mine and drops Open.** With the Inbox holding every conversation again,
   Open was the same list.
5. **A hand-off only logs.** Replying from your personal mailbox (ADR 0030) records a `handoff`
   event, shown as "Ana continued this conversation in their inbox", and changes nothing else:
   not the status, not the owner, not anyone's Done. Cancelling the send inside its undo window
   deletes that event, since the hand-off never happened. A hand-off made before this change
   (its event carries `previous`) is still undone the old way, so one queued across the deploy
   reopens and goes back to its owner.

## Consequences

- On a shared inbox, everyone clears every conversation themselves. That is the intended cost
  for small teams; the ticket model (owner, status, Mine, SLA) is there when a team needs more.
- The helpdesk list views (Mine) still bind `e` and `h` to Resolve and Snooze; aligning those keys
  with the toolbar is a follow-up.
- A handed-off conversation stays open for the team until someone resolves it or each person marks
  it done; the customer's next reply goes to the personal mailbox, so it will not reopen.
