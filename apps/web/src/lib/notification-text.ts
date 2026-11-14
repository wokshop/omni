// What a notification says, in the panel and as a desktop notification: a line naming who did
// what, and what it is about (the conversation's subject; nothing for a workspace notification).
import type { Notification } from "./types.ts";

/** Who did it, by name, else by address; undefined when nobody did (a customer, a clock). */
export function actorName(n: Pick<Notification, "actor">) {
  return n.actor ? n.actor.name || n.actor.email || undefined : undefined;
}

/** The line that says what happened. */
export function notificationTitle(n: Pick<Notification, "kind" | "actor">) {
  const actor = actorName(n);
  switch (n.kind) {
    case "assigned":
      return actor ? `${actor} assigned you` : "Assigned to you";
    case "mention":
      return actor ? `${actor} mentioned you` : "You were mentioned";
    case "note":
      return actor ? `${actor} left a note` : "New note";
    case "customer_reply":
      return "The customer replied";
    case "sla_at_risk":
      return "Due soon";
    case "sla_breached":
      return "Overdue";
    case "member_joined":
      return actor ? `${actor} joined the workspace` : "Someone joined the workspace";
  }
}

/** What it is about: the conversation's subject, or nothing for a workspace notification. */
export function notificationSubject(n: Pick<Notification, "threadId" | "subject">) {
  if (!n.threadId) return undefined;
  return n.subject || "(no subject)";
}
