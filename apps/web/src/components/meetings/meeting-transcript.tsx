import { useMemo, useState } from "react";
import { Skeleton } from "skullet/react";
import { IconCheck, IconCopy } from "@/components/icons/central";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { SearchField, SearchInput } from "@/components/ui/search-field";
import { appToast } from "@/components/ui/toast";
import { useClipboard } from "@/hooks/use-clipboard.ts";
import { useMeetingTranscript, useMeetingWrites } from "@/hooks/use-meetings.ts";
import { meetingClock, type Meeting, type MeetingSegment } from "@/lib/meetings.ts";

/** Each speaker's name, by the engine's label: the name given, else `Speaker N`. */
export function speakerNames(meeting: Meeting) {
  return new Map(meeting.speakers.map((s, i) => [s.label, s.name ?? `Speaker ${i + 1}`]));
}

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase();

/** Who said what, turn by turn: a face, a name to fix, the time to play from, the words. */
export function MeetingTranscript(props: {
  meeting: Meeting;
  canRename: boolean;
  onSeek: (ms: number) => void;
}) {
  const id = props.meeting.meeting.id;
  const transcript = useMeetingTranscript(id);
  const [query, setQuery] = useState("");
  const { copy, copied } = useClipboard();
  const names = speakerNames(props.meeting);
  const nameOf = (segment: MeetingSegment) => names.get(segment.speaker ?? "") ?? "Unknown";
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = transcript.data ?? [];
    return needle ? all.filter((s) => s.text.toLowerCase().includes(needle)) : all;
  }, [transcript.data, query]);
  const text = () =>
    (transcript.data ?? [])
      .map((s) => `[${meetingClock(s.startMs)}] ${nameOf(s)}: ${s.text}`)
      .join("\n");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <SearchField
          aria-label="Find in transcript"
          value={query}
          onChange={setQuery}
          className="min-w-0 flex-1"
        >
          <SearchInput placeholder="Find in transcript" />
        </SearchField>
        <Button intent="outline" size="sm" onPress={() => void copy(text())}>
          {copied ? <IconCheck data-slot="icon" /> : <IconCopy data-slot="icon" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Skeleton loading={transcript.isPending} label="Loading">
        <ol className="flex flex-col gap-5">
          {shown.map((segment) => (
            <li key={segment.seq} className="flex gap-3">
              <Avatar size="sm" initials={initial(nameOf(segment))} className="mt-0.5" />
              <div className="flex min-w-0 flex-1 flex-col gap-y-1">
                <div className="flex h-6 items-center gap-1">
                  {props.canRename && segment.speaker ? (
                    <SpeakerMenu
                      meeting={props.meeting}
                      label={segment.speaker}
                      name={nameOf(segment)}
                    />
                  ) : (
                    <span className="text-sm">{nameOf(segment)}</span>
                  )}
                  <Button
                    intent="plain"
                    size="sm"
                    aria-label={`Play from ${meetingClock(segment.startMs)}`}
                    onPress={() => props.onSeek(segment.startMs)}
                    className="text-xs text-muted-foreground tabular-nums"
                  >
                    {meetingClock(segment.startMs)}
                  </Button>
                </div>
                <p className="text-sm text-foreground">{segment.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Skeleton>
    </div>
  );
}

function SpeakerMenu(props: { meeting: Meeting; label: string; name: string }) {
  const { renameSpeaker } = useMeetingWrites();
  return (
    <MenuTrigger>
      <Button intent="plain" size="sm" className="-ms-2 text-sm">
        {props.name}
      </Button>
      <Menu
        aria-label={`Who is ${props.name}`}
        onAction={(key) => {
          const person = props.meeting.attendees.find((a) => a.address === key);
          if (!person) return;
          renameSpeaker.mutate(
            {
              id: props.meeting.meeting.id,
              label: props.label,
              name: person.name ?? person.address,
              address: person.address,
            },
            { onError: () => appToast.error("The speaker could not be renamed") },
          );
        }}
      >
        {props.meeting.attendees.map((person) => (
          <MenuItem
            key={person.address}
            id={person.address}
            textValue={person.name ?? person.address}
          >
            <Avatar size="xs" initials={initial(person.name ?? person.address)} />
            <MenuLabel>{person.name ?? person.address}</MenuLabel>
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
