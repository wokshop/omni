// Writing a comment from the preview's island: a small popover over the Comment tool. Opened by
// the tool for a comment on the whole file, or by a box drawn with the area tool for a comment on
// that part of the page. Reading threads is the comments sidebar's job, not this one's.
//
// Geometry: an 18rem popover, 12px in from its edges; the box's page as a tag above the field,
// then the field and Send on one row.
import { useState } from "react";
import { IconSend, IconX } from "@/components/icons/central";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCommentActions } from "@/hooks/use-storage.ts";
import { storageErrorToast } from "../storage-errors.ts";
import type { PdfBox } from "./pdf-marks.tsx";

export function CommentComposer(props: {
  fileId: string;
  shareId?: string | undefined;
  /** A box drawn on a PDF page; the whole file when null. */
  draft: PdfBox | null;
  onClearDraft: () => void;
  onSent: () => void;
}) {
  const { add } = useCommentActions();
  const [text, setText] = useState("");
  const { draft } = props;

  const send = () => {
    const body = text.trim();
    if (!body || add.isPending) return;
    add.mutate(
      {
        id: props.fileId,
        ...(props.shareId ? { shareId: props.shareId } : {}),
        body: { body, ...(draft ? { anchor: { kind: "pdf" as const, ...draft } } : {}) },
      },
      {
        onSuccess: () => {
          setText("");
          props.onSent();
        },
        onError: (error) => storageErrorToast(error, "Your comment was not sent"),
      },
    );
  };

  return (
    <div className="flex w-72 flex-col gap-2 p-3">
      {draft && (
        <div className="flex items-center gap-1">
          <Badge intent="secondary" className="tabular-nums">
            Page {draft.page} area
          </Badge>
          <Button intent="plain" size="sq-xs" aria-label="Remove area" onPress={props.onClearDraft}>
            <IconX />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opens to write in it.
          autoFocus
          aria-label="Comment"
          placeholder="Comment"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          className="max-h-40 min-h-9"
        />
        <Button
          intent="primary"
          size="sq-md"
          aria-label="Send"
          isPending={add.isPending}
          isDisabled={!text.trim()}
          onPress={send}
        >
          <IconSend />
        </Button>
      </div>
    </div>
  );
}
