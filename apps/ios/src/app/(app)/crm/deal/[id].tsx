import { Stack, useLocalSearchParams } from "expo-router";
import { PersonRow } from "@/components/crm/record-rows.tsx";
import { Fields, RecordView, Section } from "@/components/crm/record-view.tsx";
import { RecordActions } from "@/components/crm/record-actions.tsx";
import { TimelineSection } from "@/components/crm/timeline-section.tsx";
import { dealValue, useDeal, useStageNames } from "@/lib/crm.ts";
import { listTime } from "@/lib/mail.ts";

/** A deal: its stage and value, and the people on it. */
export default function Deal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stages = useStageNames().data;
  return (
    <RecordView query={useDeal(id)} title={(data) => data.deal.name}>
      {(data) => (
        <>
          <RecordActions kind="deals" id={id} stageId={data.deal.stageId} />
          <Fields
            fields={[
              ["Stage", stages?.get(data.deal.stageId)],
              ["Value", dealValue(data.deal)],
              ["Last contacted", data.lastContactedAt ? listTime(data.lastContactedAt) : null],
            ]}
          />
          <Section title="People" items={data.people} render={(p) => <PersonRow person={p} />} />
          <TimelineSection kind="deals" id={id} />
        </>
      )}
    </RecordView>
  );
}
