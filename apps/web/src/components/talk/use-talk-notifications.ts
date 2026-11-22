import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  desktopNotificationsOn,
  inBackground,
  showNotification,
} from "@/lib/desktop-notifications.ts";
import { keys } from "@/lib/query-keys.ts";
import { onTalkMessage } from "@/lib/realtime.ts";
import type { TalkPerson } from "@/lib/talk.ts";
import { talkWindow } from "@/lib/talk-window.ts";

/**
 * A teammate's note that arrives while its window is closed, or Omni is in the background, shows
 * a system notification (when they are on for this device); clicking it opens the window.
 */
export function useTalkNotifications(meId: string) {
  const client = useQueryClient();
  useEffect(
    () =>
      onTalkMessage((event) => {
        if (event.fromMemberId === meId) return;
        const looking = talkWindow.get().memberId === event.fromMemberId && !inBackground();
        if (looking || !desktopNotificationsOn()) return;
        const people = client.getQueryData<TalkPerson[]>(keys.talkPeople());
        const from = people?.find((p) => p.memberId === event.fromMemberId);
        showNotification(
          { tag: `talk:${event.messageId}`, title: from?.name ?? "Omni", body: event.preview },
          () => talkWindow.open(event.fromMemberId),
        );
      }),
    [client, meId],
  );
}
