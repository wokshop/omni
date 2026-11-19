import { useQuery } from "@tanstack/react-query";
import { countsQuery, type MailPage } from "./mail.ts";

const unreadBadge = (count: number) => (count > 99 ? "99+" : countOrNothing(count));
const countOrNothing = (count: number) => (count ? String(count) : undefined);

/** The count beside Mail's pages, in one mailbox or all: unread for Inbox. */
export function useMailPageCounts(mailboxId: string | undefined) {
  const counts = (useQuery(countsQuery()).data ?? []).filter(
    (c) => !mailboxId || c.mailboxId === mailboxId,
  );
  const sum = (count: (c: (typeof counts)[number]) => number) =>
    counts.reduce((acc, c) => acc + count(c), 0);
  return {
    inbox: unreadBadge(sum((c) => c.unread)),
  } satisfies Partial<Record<MailPage, string | undefined>>;
}

/** Mail's pages for the page menu, each with its count. */
export function useCountedPages<Page extends { id: MailPage }>(
  pages: readonly Page[],
  mailboxId: string | undefined,
) {
  const counts: Partial<Record<MailPage, string | undefined>> = useMailPageCounts(mailboxId);
  return pages.map((page) => ({ ...page, count: counts[page.id] }));
}
