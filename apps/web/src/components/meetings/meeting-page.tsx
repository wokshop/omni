import { useRef, type ReactNode } from "react";
import { Skeleton } from "skullet/react";
import { EmptyState } from "@/components/empty/empty-state";
import { StorageFrame } from "@/components/storage/storage-frame";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { appToast } from "@/components/ui/toast";
import {
  useMeeting,
  useMeetingDraft,
  useMeetingTranscript,
  useMeetingWrites,
} from "@/hooks/use-meetings.ts";
import { ApiError } from "@/lib/api.ts";
import {
  meetingAudioUrl,
  meetingClock,
  type Meeting,
  type MeetingAction,
  type MeetingSegment,
} from "@/lib/meetings.ts";

const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const WORKING: Record<string, string> = {
  recording: "Recording",
  uploaded: "Transcribing",
  transcribing: "Transcribing",
  naming: "Naming speakers",
  writing: "Writing notes",
};

/** One recorded meeting: what it came to, what to do next, and who said what. */
export function MeetingPage({ id }: { id: string }) {
  const meeting = useMeeting(id);
  const audio = useRef<HTMLAudioElement>(null);
  const seek = (ms: number) => {
    if (!audio.current) return;
    audio.current.currentTime = ms / 1000;
    void audio.current.play();
  };
  if (!meeting.data) return <MeetingState query={meeting} />;
  const { meeting: m, notes, actions, role } = meeting.data;
  const editor = role !== "viewer";
  return (
    <StorageFrame
      title={<h1 className="truncate text-md">{m.title ?? "Untitled meeting"}</h1>}
      caption={DAY.format(new Date(m.startedAt))}
      actions={<MeetingActions id={id} meeting={meeting.data} />}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-6">
          {WORKING[m.status] && (
            <p className="text-sm text-muted-foreground">{WORKING[m.status]}</p>
          )}
          {m.status === "failed" && <p className="text-sm text-danger">{m.failure}</p>}
          {notes?.summary && <p className="text-sm">{notes.summary}</p>}
          {m.hasAudio && (
            <Section label="Recording">
              {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
              <audio
                ref={audio}
                src={meetingAudioUrl(id)}
                aria-label="Recording"
                controls
                preload="metadata"
                className="w-full"
              />
            </Section>
          )}
          {notes && notes.highlights.length > 0 && (
            <Section label="Highlights">
              {notes.highlights.map((h) => (
                <Moment key={`${h.atMs}:${h.text}`} atMs={h.atMs} onSeek={seek}>
                  {h.text}
                </Moment>
              ))}
            </Section>
          )}
          {actions.some((a) => a.state === "open") && (
            <Section label="Actions">
              {actions
                .filter((a) => a.state === "open")
                .map((action) => (
                  <ActionRow key={action.id} action={action} canDecide={editor} />
                ))}
            </Section>
          )}
          {m.status === "ready" && (
            <Transcript id={id} meeting={meeting.data} canRename={editor} onSeek={seek} />
          )}
        </div>
      </div>
    </StorageFrame>
  );
}

function Section(props: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs text-muted-foreground">{props.label}</h2>
      {props.children}
    </section>
  );
}

function Moment(props: { atMs: number; onSeek: (ms: number) => void; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <Button
        intent="plain"
        size="sm"
        onPress={() => props.onSeek(props.atMs)}
        className="-ms-2 shrink-0 text-xs text-muted-foreground tabular-nums"
      >
        {meetingClock(props.atMs)}
      </Button>
      <p className="min-w-0 text-sm">{props.children}</p>
    </div>
  );
}

function ActionRow({ action, canDecide }: { action: MeetingAction; canDecide: boolean }) {
  const { decideAction } = useMeetingWrites();
  const draft = useMeetingDraft();
  const payload = action.payload as {
    title?: string;
    owner?: string | null;
    due?: string | null;
    to?: string[];
    subject?: string;
    body?: string;
  };
  const decide = (accept: boolean) =>
    decideAction.mutate(
      { id: action.id, accept },
      { onError: () => appToast.error("That action could not be saved") },
    );
  const meta =
    action.kind === "task"
      ? [payload.owner, payload.due].filter(Boolean).join(" · ")
      : (payload.to ?? []).join(", ");
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-y-1">
        <span className="truncate text-sm">
          {action.kind === "task" ? payload.title : payload.subject}
        </span>
        {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
      </div>
      {canDecide && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button intent="outline" size="sm" onPress={() => decide(false)}>
            Dismiss
          </Button>
          {action.kind === "task" ? (
            <Button size="sm" isPending={decideAction.isPending} onPress={() => decide(true)}>
              Add to calendar
            </Button>
          ) : (
            <Button
              size="sm"
              isPending={draft.isPending}
              onPress={() =>
                draft.mutate(
                  {
                    to: payload.to ?? [],
                    subject: payload.subject ?? "",
                    body: payload.body ?? "",
                  },
                  {
                    onSuccess: () => decide(true),
                    onError: () => appToast.error("The draft could not be made"),
                  },
                )
              }
            >
              Open draft
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Transcript(props: {
  id: string;
  meeting: Meeting;
  canRename: boolean;
  onSeek: (ms: number) => void;
}) {
  const transcript = useMeetingTranscript(props.id);
  const names = new Map(
    props.meeting.speakers.map((s, i) => [s.label, s.name ?? `Speaker ${i + 1}`]),
  );
  return (
    <Section label="Transcript">
      <Skeleton loading={transcript.isPending} label="Loading">
        <div className="flex flex-col gap-4">
          {(transcript.data ?? []).map((segment) => (
            <Turn
              key={segment.seq}
              segment={segment}
              name={names.get(segment.speaker ?? "") ?? "Unknown"}
              {...props}
            />
          ))}
        </div>
      </Skeleton>
    </Section>
  );
}

function Turn(props: {
  id: string;
  meeting: Meeting;
  segment: MeetingSegment;
  name: string;
  canRename: boolean;
  onSeek: (ms: number) => void;
}) {
  const { segment } = props;
  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex items-center gap-2">
        {props.canRename && segment.speaker ? (
          <SpeakerMenu
            id={props.id}
            label={segment.speaker}
            name={props.name}
            attendees={props.meeting.attendees}
          />
        ) : (
          <span className="text-sm">{props.name}</span>
        )}
        <Button
          intent="plain"
          size="sm"
          onPress={() => props.onSeek(segment.startMs)}
          className="text-xs text-muted-foreground tabular-nums"
        >
          {meetingClock(segment.startMs)}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{segment.text}</p>
    </div>
  );
}

function SpeakerMenu(props: {
  id: string;
  label: string;
  name: string;
  attendees: Meeting["attendees"];
}) {
  const { renameSpeaker } = useMeetingWrites();
  return (
    <MenuTrigger>
      <Button intent="plain" size="sm" className="-ms-2 text-sm">
        {props.name}
      </Button>
      <Menu
        aria-label={`Who is ${props.name}`}
        onAction={(key) => {
          const person = props.attendees.find((a) => a.address === key);
          if (!person) return;
          renameSpeaker.mutate(
            {
              id: props.id,
              label: props.label,
              name: person.name ?? person.address,
              address: person.address,
            },
            { onError: () => appToast.error("The speaker could not be renamed") },
          );
        }}
      >
        {props.attendees.map((person) => (
          <MenuItem
            key={person.address}
            id={person.address}
            textValue={person.name ?? person.address}
          >
            <Avatar size="xs" initials={(person.name ?? person.address).slice(0, 1)} />
            <MenuLabel>{person.name ?? person.address}</MenuLabel>
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}

function MeetingActions({ id, meeting }: { id: string; meeting: Meeting }) {
  const { retry } = useMeetingWrites();
  if (meeting.meeting.status !== "failed" || meeting.role === "viewer") return null;
  return (
    <Button
      intent="outline"
      size="sm"
      isPending={retry.isPending}
      onPress={() =>
        retry.mutate(id, { onError: () => appToast.error("The meeting could not be retried") })
      }
    >
      Try again
    </Button>
  );
}

function MeetingState(props: { query: { isPending: boolean; error: unknown } }) {
  const gone = props.query.error instanceof ApiError && props.query.error.status === 404;
  return (
    <StorageFrame title={null}>
      {props.query.isPending ? (
        <Skeleton loading label="Loading">
          {null}
        </Skeleton>
      ) : (
        <EmptyState
          figure="loupe"
          title={gone ? "This meeting is gone" : "This meeting could not be loaded"}
        />
      )}
    </StorageFrame>
  );
}
