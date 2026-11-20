# 0054: CRM tasks

Date: 2026-11-20 · Status: accepted · Amends: ADR 0036 "Not in v1" (tasks), `docs/spec/crm.md`
non-goals · Builds on: ADR 0035, ADR 0036, ADR 0039

## Context

ADR 0036 left tasks out of the CRM's first version. The founder asked for them on Nov 20, 2026, as
part of bringing the CRM to parity with Attio, HubSpot, Folk and Pipedrive: a page listing every
task (mine, by assignee, due, overdue, done), a page per task, and tasks on each record, on web
and iOS. Linear is the reference for how tasks look and feel.

## Decision

1. **A task is a CRM row.** `crm_tasks` (in `schema/crm/tasks.ts`): id, org_id, title, body,
   company_id | person_id | deal_id (at most one, by a check constraint), assignee_member_id,
   due_at, completed_at, completed_by_member_id, created_by_member_id, timestamps. A task on no
   record is allowed: "call the accountant" belongs to nobody's record.
2. **Same audience as every record** (ADR 0036 decision 1). Every member of the company reads,
   writes, completes and deletes every task, as in Linear and Attio. A Personal space has none.
3. **Due is a moment, not a day.** `due_at` is a `timestamptz`. A client picking "Friday" sends
   the end of Friday in its own time zone, so overdue (`due_at < now()`) is the same answer on
   every client and needs no time zone on the server.
4. **Done is a time.** `completed_at` set is done; `PATCH { done }` sets or clears it with who
   did it. Completing twice changes nothing.
5. **Assigned to its creator by default**, like a deal's owner. `assigneeMemberId: null` makes it
   unassigned. Member columns are `on delete set null`, so a removed member leaves their tasks
   unassigned rather than blocking the removal.
6. **One list route with filters, ordered for work.** `GET /api/crm/tasks` takes `status`
   (`open`, the default, or `done`), `assignee` (a member id, `me` or `none`), `due`
   (`overdue`, `upcoming`, `none`), one of `company`, `person`, `deal`, and `q` (the title
   contains it). Open tasks come soonest due first, undated last; done tasks most recently
   completed first. Each order has a partial index and a keyset cursor. `GET /tasks/counts`
   answers the numbers the navigation shows. Each task carries its record's name so a list needs
   no second request.
7. **A record's tasks are its own.** A company's panel shows tasks on that company, not on its
   deals or people: a deal is the project, and its tasks are on it.
8. **Realtime and timeline.** Every write publishes `crm.changed` with kind `task` (old clients
   drop kinds they do not know). Tasks do not write `crm_events` in this version; the record's
   tasks panel is where they show.

## Not now

Reminders and notifications on assignment or due, recurring tasks, subtasks, several records per
task, mentions, and MCP tools for tasks. Each is additive.

## Consequences

- One additive table and migration; no other table changes.
- Tasks are CRM truth like notes: not rebuilt from the mail host, kept by database backups.
