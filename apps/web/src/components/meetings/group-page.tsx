import { Link } from "@tanstack/react-router";
import { Skeleton } from "skullet/react";
import { EmptyState } from "@/components/empty/empty-state";
import { StorageFrame } from "@/components/storage/storage-frame";
import { useMeetingGroup, useMeetingGroups } from "@/hooks/use-meetings.ts";
import { useWorkspaceSlug } from "@/hooks/use-workspaces.ts";
import { groupTitle } from "@/lib/meetings.ts";

const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** A series or a client's meetings as one page: where things stand, and what was decided when. */
export function GroupPage({ groupKey }: { groupKey: string }) {
  const page = useMeetingGroup(groupKey);
  const groups = useMeetingGroups();
  const workspace = useWorkspaceSlug();
  const group = groups.data?.find((g) => g.groupKey === groupKey);
  const title = group ? groupTitle(group) : null;
  return (
    <StorageFrame title={<h1 className="truncate text-md">{title}</h1>}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Skeleton loading={page.isPending} label="Loading">
          {page.data && page.data.meetings.length === 0 ? (
            <EmptyState figure="cabinet" title="No meetings with notes yet" />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-6">
              {page.data?.summary && <p className="text-sm">{page.data.summary}</p>}
              {page.data && page.data.timeline.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-xs text-muted-foreground">Timeline</h2>
                  {page.data.timeline.map((item) => (
                    <div
                      key={`${item.meetingId}:${item.atMs}:${item.text}`}
                      className="flex items-baseline gap-3"
                    >
                      <p className="min-w-0 flex-1 text-sm">{item.text}</p>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {DAY.format(new Date(item.startedAt))}
                      </span>
                    </div>
                  ))}
                </section>
              )}
              <section className="flex flex-col gap-2">
                <h2 className="text-xs text-muted-foreground">Meetings</h2>
                {page.data?.meetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    to="/$workspace/meetings/$id"
                    params={{ workspace, id: meeting.id }}
                    className="flex flex-col gap-y-1 rounded-lg px-2 py-2 hover:bg-hover"
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {meeting.title ?? "Untitled meeting"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {DAY.format(new Date(meeting.startedAt))}
                      </span>
                    </span>
                    {meeting.summary && (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {meeting.summary}
                      </span>
                    )}
                  </Link>
                ))}
              </section>
            </div>
          )}
        </Skeleton>
      </div>
    </StorageFrame>
  );
}

/** The module's home: the newest group, or nothing yet. */
export function MeetingsHome() {
  const groups = useMeetingGroups();
  const first = groups.data?.[0];
  if (first) return <GroupPage groupKey={first.groupKey} />;
  return (
    <StorageFrame title={<h1 className="truncate text-md">Meetings</h1>}>
      <Skeleton loading={groups.isPending} label="Loading">
        <EmptyState figure="cabinet" title="No meetings yet" />
      </Skeleton>
    </StorageFrame>
  );
}
