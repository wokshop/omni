import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createDraft } from "@/lib/compose.ts";
import { useAllMailboxes } from "./use-mail.ts";
import { useWorkspaceSlug } from "./use-workspaces.ts";
import {
  changeMeetingMutation,
  decideActionMutation,
  deleteMeetingMutation,
  grantMeetingMutation,
  meetingGroupQuery,
  meetingGroupsQuery,
  meetingQuery,
  meetingsEnabledQuery,
  meetingTranscriptQuery,
  renameSpeakerMutation,
  retryMeetingMutation,
  revokeMeetingMutation,
} from "@/lib/meetings.ts";

export const useMeetingsEnabled = () => useQuery(meetingsEnabledQuery()).data === true;
export const useMeetingGroups = () => useQuery(meetingGroupsQuery());
export const useMeetingGroup = (key: string) => useQuery(meetingGroupQuery(key));
export const useMeeting = (id: string) => useQuery(meetingQuery(id));
export const useMeetingTranscript = (id: string) => useQuery(meetingTranscriptQuery(id));

/** Every write on a meeting, each refreshing what it changed when it settles. */
export function useMeetingWrites() {
  const client = useQueryClient();
  return {
    renameSpeaker: useMutation(renameSpeakerMutation(client)),
    decideAction: useMutation(decideActionMutation(client)),
    change: useMutation(changeMeetingMutation(client)),
    grant: useMutation(grantMeetingMutation(client)),
    revoke: useMutation(revokeMeetingMutation(client)),
    retry: useMutation(retryMeetingMutation(client)),
    remove: useMutation(deleteMeetingMutation(client)),
  };
}

/**
 * A meeting's follow-up email, as a draft in the person's own mailbox, opened in Drafts to read,
 * change and send. Nothing is sent from here.
 */
export function useMeetingDraft() {
  const { data: mailboxes } = useAllMailboxes();
  const navigate = useNavigate();
  const workspace = useWorkspaceSlug();
  return useMutation({
    mutationFn: async (email: { to: string[]; subject: string; body: string }) => {
      const mailbox = mailboxes?.[0];
      if (!mailbox) throw new Error("no mailbox to write from");
      const draft = await createDraft({
        mailboxId: mailbox.id,
        kind: "new",
        to: email.to.map((address) => ({ name: null, address })),
        subject: email.subject,
        bodyText: email.body,
      });
      await navigate({
        to: "/$workspace/mail/drafts",
        params: { workspace },
        search: { mailbox: mailbox.id, draft: draft.id },
      });
    },
  });
}
