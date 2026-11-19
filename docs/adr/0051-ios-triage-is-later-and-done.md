# 0051: On iOS, triage is Later and Done

Date: 2026-11-19 · Status: accepted · Amends: spec v1 "Clients" (iOS triage lanes, swipe to snooze)

## Context

The spec says the iOS app has "the same triage lanes, swipe to archive or snooze". By the time
the app shipped to TestFlight it had grown several overlapping ways to put a thread aside:

- Needs reply and Awaiting reply pages in the menu, built on the AI lanes.
- A Lane button and sheet on every conversation (Needs reply, Awaiting reply, FYI, Noise).
- A Later sheet with times (Later today, Tomorrow, Next week) that called the timed
  `POST /threads/:id/defer`, which ADR 0027 replaced with an untimed Later.
- On shared inboxes, a Status button and sheet with Open, Resolve and two more snoozes.

Rodrigo wants the app to triage with two actions, Later and Done, and nothing else.

## Decision

1. **iOS triage is Later and Done.** A row swipes right for Done and left for Later; the
   conversation's bar and the row's menu offer the same two. Later is one tap, with no time
   (`POST`/`DELETE /threads/:id/later`, ADR 0027).
2. **No lanes on iOS.** The Needs reply and Awaiting reply pages, the Lane button and its sheet
   are gone. Mail's views are Inbox, Later and Done.
3. **No helpdesk status on iOS.** The Status button and its sheet (resolve, reopen, snooze) are
   gone. A shared-inbox conversation keeps assignee, priority and tags, which only shared inboxes
   have; a personal thread shows no tags.
4. **The API is unchanged.** The AI still files lanes, and the web still shows them and the
   helpdesk status. This decision is the iOS client only.

## Consequences

- On iOS a teammate can't resolve or snooze a shared conversation for the whole team; Done and
  Later act for the member alone (ADR 0007). The web still can.
- If lanes and helpdesk status go from the web too, that is its own decision and its own ADR,
  covering the AI triage pipeline and `/counts`.
