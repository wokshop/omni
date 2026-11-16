// The uploads in progress, floating at the screen's bottom right over the list: each file's name,
// how far it is, and the way to stop it; a failed one drops its bar and offers Retry (it resumes).
//
// Geometry: a 320px card, 16px from the screen's bottom and right edges, 12px in on every side;
// each file is a 24px line (name, then the percent and a 20px action) with the bar 6px under it,
// and 12px between files.
import { IconArrowRotateClockwise, IconX } from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar";
import { useUploads } from "@/hooks/use-storage.ts";

export function UploadsPanel() {
  const { uploads, retry, remove } = useUploads();
  if (!uploads.length) return null;
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex justify-end">
      <ul className="pointer-events-auto flex max-h-72 w-80 max-w-full flex-col gap-3 overflow-y-auto rounded-lg border bg-background p-3 shadow-(--shadow-overlay)">
        {uploads.map((item) => {
          const failed = item.status === "failed";
          const percent = item.size ? Math.floor((item.sent / item.size) * 100) : 0;
          return (
            <li key={item.id} className="flex flex-col gap-1.5">
              <div className="flex h-6 items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {failed ? "Failed" : `${percent}%`}
                </span>
                {failed && (
                  <Button
                    intent="plain"
                    size="sq-2xs"
                    aria-label={`Retry ${item.name}`}
                    onPress={() => retry(item.id)}
                  >
                    <IconArrowRotateClockwise />
                  </Button>
                )}
                <Button
                  intent="plain"
                  size="sq-2xs"
                  aria-label={failed ? `Remove ${item.name}` : `Cancel ${item.name}`}
                  onPress={() => remove(item.id)}
                >
                  <IconX />
                </Button>
              </div>
              {/* A failed upload has no progress to show: what it sent may never have arrived. */}
              {!failed && (
                <ProgressBar aria-label={`Uploading ${item.name}`} value={percent}>
                  <ProgressBarTrack className="min-w-0" />
                </ProgressBar>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
