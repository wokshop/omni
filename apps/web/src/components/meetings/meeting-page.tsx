import { useRef, useState, type ReactNode } from "react";
import { Skeleton } from "skullet/react";
import { RecordMark } from "@/components/crm/record-list";
import { DetailSection } from "@/components/crm/record-layout";
import { PlainValue } from "@/components/crm/record-fields";
import { EmptyState } from "@/components/empty/empty-state";
import {
  IconArrowRotateClockwise,
  IconChecklist,
  IconCircleAlert,
  IconEllipsis,
  IconMail,
  IconMicrophone,
  IconTrash,
} from "@/components/icons/central";
import { StorageFrame } from "@/components/storage/storage-frame";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Menu, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { appToast } from "@/components/ui/toast";
import { useMeeting, useMeetingDraft, useMeetingWrites } from "@/hooks/use-meetings.ts";
import { ApiError } from "@/lib/api.ts";
import {
  groupKind,
  meetingAudioUrl,
  meetingClock,
  type Meeting,
  type MeetingAction,
} from "@/lib/meetings.ts";
import { ShareMeetingDialog } from "./meeting-share.tsx";
import { MeetingTranscript, speakerNames } from "./meeting-transcript.tsx";

const WHEN = new Intl.DateTimeFormat(undefined, {
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

const NAMED_BY: Record<string, string> = {
  mic: "Recorder's microphone",
  engine: "Transcription",
  ai: "Notes",
  person: "Named by hand",
};

const LANGUAGES = new Intl.DisplayNames(undefined, { type: "language" });

const minutes = (ms: number | null) => (ms ? `${Math.max(1, Math.round(ms / 60_000))} min` : null);

/** One recorded meeting, laid out like a client's page: its head, the recording, tabs, details. */
export function MeetingPage({ id }: { id: string }) {
  const meeting = useMeeting(id);
  const audio = useRef<HTMLAudioElement>(null);
  const [sharing, setSharing] = useState(false);
  const seek = (ms: number) => {
    if (!audio.current) return;
    audio.current.currentTime = ms / 1000;
    void audio.current.play();
  };
  if (!meeting.data) return <MeetingState query={meeting} />;
  const data = meeting.data;
  const m = data.meeting;
  const editor = data.role !== "viewer";
  const open = data.actions.filter((a) => a.state === "open");
  return (
    <StorageFrame
      title={<h1 className="truncate text-md">{m.title ?? "Untitled meeting"}</h1>}
      bordered
      actions={
        <>
          {editor && (
            <Button intent="outline" size="sm" onPress={() => setSharing(true)}>
              Share
            </Button>
          )}
          <MoreMenu meeting={data} />
        </>
      }
    >
      <div className="flex min-h-0 flex-1 overflow-y-auto max-lg:flex-col lg:overflow-hidden">
        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-8 pb-12">
            <MeetingHead meeting={data} />
            <Progress meeting={data} />
            {m.hasAudio && (
              <section className="flex flex-col gap-2 rounded-lg border bg-background px-4 py-3">
                <span className="text-xs text-muted-foreground">Recording</span>
                {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
                <audio
                  ref={audio}
                  src={meetingAudioUrl(id)}
                  aria-label="Recording"
                  controls
                  preload="metadata"
                  className="w-full"
                />
              </section>
            )}
            <Tabs className="w-full">
              <TabList
                aria-label="Meeting"
                className="sticky top-0 z-10 bg-background pt-1.5 [--tab-list-pb:--spacing(1.5)]"
              >
                <Tab id="summary">Summary</Tab>
                <Tab id="actions">
                  Actions
                  {open.length > 0 && (
                    <span className="ms-1.5 text-subtle-foreground tabular-nums">
                      {open.length}
                    </span>
                  )}
                </Tab>
                <Tab id="transcript">Transcript</Tab>
              </TabList>
              <TabPanel id="summary" className="flex flex-col gap-6 pt-4">
                <Summary meeting={data} onSeek={seek} />
              </TabPanel>
              <TabPanel id="actions" className="flex flex-col gap-2 pt-4">
                <Actions actions={data.actions} canDecide={editor} />
              </TabPanel>
              <TabPanel id="transcript" className="flex flex-col pt-4">
                {m.status === "ready" ? (
                  <MeetingTranscript meeting={data} canRename={editor} onSeek={seek} />
                ) : (
                  <None />
                )}
              </TabPanel>
            </Tabs>
          </div>
        </main>
        <Details meeting={data} />
      </div>
      {sharing && <ShareMeetingDialog meeting={data} onClose={() => setSharing(false)} />}
    </StorageFrame>
  );
}

function MeetingHead({ meeting }: { meeting: Meeting }) {
  const m = meeting.meeting;
  const kind = groupKind(m.groupKey);
  const domain = kind === "domain" ? m.groupKey.slice("domain:".length) : null;
  const meta = [WHEN.format(new Date(m.startedAt)), minutes(m.durationMs)].filter(Boolean);
  return (
    <header className="flex min-w-0 items-start gap-4">
      {domain ? (
        <RecordMark name={domain} square who={{ domain }} size={48} />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-lg border bg-surface">
          <IconMicrophone className="size-5 text-muted-foreground" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate text-lg text-foreground">{m.title ?? "Untitled meeting"}</h2>
        <p className="truncate text-sm text-muted-foreground tabular-nums">{meta.join(" · ")}</p>
        {meeting.notes && meeting.notes.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {meeting.notes.topics.map((topic) => (
              <Badge key={topic} intent="secondary">
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function Progress({ meeting }: { meeting: Meeting }) {
  const { retry } = useMeetingWrites();
  const m = meeting.meeting;
  if (WORKING[m.status]) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3">
        <Loader className="size-4 text-muted-foreground" />
        <span className="text-sm">{WORKING[m.status]}</span>
      </div>
    );
  }
  if (m.status !== "failed") return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3">
      <IconCircleAlert className="size-icon shrink-0 text-danger" />
      <span className="min-w-0 flex-1 truncate text-sm">{m.failure}</span>
      {meeting.role !== "viewer" && (
        <Button
          intent="outline"
          size="sm"
          isPending={retry.isPending}
          onPress={() =>
            retry.mutate(m.id, {
              onError: () => appToast.error("The meeting could not be retried"),
            })
          }
        >
          Try again
        </Button>
      )}
    </div>
  );
}

function Summary({ meeting, onSeek }: { meeting: Meeting; onSeek: (ms: number) => void }) {
  const notes = meeting.notes;
  if (!notes?.summary && !notes?.highlights.length) return <None />;
  return (
    <>
      {notes.summary && <p className="text-sm text-foreground">{notes.summary}</p>}
      {notes.highlights.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Highlights">
          <h3 className="text-sm text-foreground">
            Highlights{" "}
            <span className="text-subtle-foreground tabular-nums">{notes.highlights.length}</span>
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border bg-background">
            {notes.highlights.map((h) => (
              <li key={`${h.atMs}:${h.text}`} className="flex items-center gap-3 px-4 py-2.5">
                <Button
                  intent="outline"
                  size="sm"
                  aria-label={`Play from ${meetingClock(h.atMs)}`}
                  onPress={() => onSeek(h.atMs)}
                  className="shrink-0 text-xs tabular-nums"
                >
                  {meetingClock(h.atMs)}
                </Button>
                <span className="min-w-0 flex-1 text-sm">{h.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Actions({ actions, canDecide }: { actions: MeetingAction[]; canDecide: boolean }) {
  if (!actions.length) return <None />;
  const open = actions.filter((a) => a.state === "open");
  const decided = actions.filter((a) => a.state !== "open");
  return (
    <>
      {open.map((action) => (
        <ActionCard key={action.id} action={action} canDecide={canDecide} />
      ))}
      {decided.map((action) => (
        <ActionCard key={action.id} action={action} canDecide={false} />
      ))}
    </>
  );
}

type Payload = {
  title?: string;
  owner?: string | null;
  due?: string | null;
  to?: string[];
  subject?: string;
  body?: string;
};

function ActionCard({ action, canDecide }: { action: MeetingAction; canDecide: boolean }) {
  const { decideAction } = useMeetingWrites();
  const draft = useMeetingDraft();
  const payload = action.payload as Payload;
  const task = action.kind === "task";
  const decide = (accept: boolean) =>
    decideAction.mutate(
      { id: action.id, accept },
      { onError: () => appToast.error("That action could not be saved") },
    );
  const meta = task
    ? [payload.owner, payload.due].filter(Boolean).join(" · ")
    : (payload.to ?? []).join(", ");
  const Glyph = task ? IconChecklist : IconMail;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface">
        <Glyph className="size-icon text-muted-foreground" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm text-foreground">
          {task ? payload.title : payload.subject}
        </span>
        {(meta || (!task && payload.body)) && (
          <span className="truncate text-xs text-muted-foreground">{meta || payload.body}</span>
        )}
      </div>
      {action.state !== "open" ? (
        <Badge intent={action.state === "done" ? "success" : "secondary"}>
          {action.state === "done" ? (task ? "In calendar" : "Drafted") : "Dismissed"}
        </Badge>
      ) : (
        canDecide && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button intent="outline" size="sm" onPress={() => decide(false)}>
              Dismiss
            </Button>
            {task ? (
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
        )
      )}
    </div>
  );
}

function Details({ meeting }: { meeting: Meeting }) {
  const m = meeting.meeting;
  const names = speakerNames(meeting);
  return (
    <aside
      aria-label="Details"
      className="flex shrink-0 flex-col gap-6 px-5 py-5 max-lg:border-t lg:w-80 lg:overflow-y-auto lg:border-s"
    >
      <DetailSection title="Details">
        <PlainValue label="When">{WHEN.format(new Date(m.startedAt))}</PlainValue>
        <PlainValue label="Length">{minutes(m.durationMs)}</PlainValue>
        <PlainValue label="Language">{m.language ? LANGUAGES.of(m.language) : null}</PlainValue>
        <PlainValue label="Status">
          {WORKING[m.status] ?? (m.status === "ready" ? "Ready" : "Failed")}
        </PlainValue>
      </DetailSection>
      <DetailSection title="People">
        {meeting.attendees.map((person) => (
          <Row
            key={person.address}
            name={person.name ?? person.address}
            title={person.address}
            meta={null}
          />
        ))}
      </DetailSection>
      {meeting.speakers.length > 0 && (
        <DetailSection title="Speakers">
          {meeting.speakers.map((s) => (
            <Row
              key={s.label}
              name={names.get(s.label) ?? s.label}
              meta={s.source ? NAMED_BY[s.source] : null}
            />
          ))}
        </DetailSection>
      )}
    </aside>
  );
}

function Row(props: { name: string; meta: ReactNode; title?: string }) {
  return (
    <div title={props.title} className="-mx-2 flex h-8 min-w-0 items-center gap-2 rounded-md px-2">
      <Avatar size="xs" initials={props.name.slice(0, 1).toUpperCase()} />
      <span className="min-w-0 flex-1 truncate text-sm">{props.name}</span>
      {props.meta && (
        <span className="shrink-0 truncate text-xs text-muted-foreground">{props.meta}</span>
      )}
    </div>
  );
}

function MoreMenu({ meeting }: { meeting: Meeting }) {
  const { retry, remove } = useMeetingWrites();
  const id = meeting.meeting.id;
  const failed = meeting.meeting.status === "failed";
  const owner = meeting.role === "owner";
  if (!owner && !(failed && meeting.role !== "viewer")) return null;
  return (
    <MenuTrigger>
      <Button intent="outline" size="sq-sm" aria-label="More">
        <IconEllipsis />
      </Button>
      <Menu
        placement="bottom end"
        aria-label="Meeting"
        onAction={(key) => {
          if (key === "retry") retry.mutate(id);
          if (key === "delete") {
            remove.mutate(id, { onError: () => appToast.error("The meeting was not deleted") });
          }
        }}
      >
        {failed && (
          <MenuItem id="retry" textValue="Try again">
            <IconArrowRotateClockwise data-slot="icon" />
            <MenuLabel>Try again</MenuLabel>
          </MenuItem>
        )}
        {owner && (
          <MenuItem id="delete" textValue="Delete meeting" intent="danger">
            <IconTrash data-slot="icon" />
            <MenuLabel>Delete meeting</MenuLabel>
          </MenuItem>
        )}
      </Menu>
    </MenuTrigger>
  );
}

function None() {
  return <span className="flex h-8 items-center text-sm text-muted-foreground">–</span>;
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
