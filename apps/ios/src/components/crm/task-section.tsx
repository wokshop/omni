import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button.tsx";
import { SectionHeading } from "@/components/ui/section-heading.tsx";
import { Text } from "@/components/ui/text.tsx";
import type { CrmRecordKind } from "@/lib/crm-mutations.ts";
import { useMemberNames } from "@/lib/crm-timeline.ts";
import { recordFilter, useTasks } from "@/lib/crm-tasks.ts";
import { gutter } from "@/theme/tokens.ts";
import { TaskRow } from "./task-row.tsx";

/** Opens the new-task sheet, on a record when given one. */
export const openNewTask = (record?: { kind: CrmRecordKind; id: string }) =>
  router.push({ pathname: "/crm/task-new", params: record ?? {} });

/** A record's tasks, as the web's Tasks tab: the open ones, then the done ones, with Add task. */
export function TaskSection({ kind, id }: { kind: CrmRecordKind; id: string }) {
  const filter = recordFilter(kind, id);
  const open = useTasks({ ...filter, status: "open" }).data ?? [];
  const done = useTasks({ ...filter, status: "done" }).data ?? [];
  const names = useMemberNames().data;
  const assignee = (memberId: string | null) => (memberId ? names?.get(memberId) : null);
  return (
    <View>
      <View style={styles.header}>
        <Text size="sm" weight="medium" tone="mutedForeground" style={styles.title}>
          Tasks
        </Text>
        <Button intent="quiet" label="Add task" onPress={() => openNewTask({ kind, id })} />
      </View>
      {open.map((task) => (
        <TaskRow key={task.id} task={task} assignee={assignee(task.assigneeMemberId)} onRecord />
      ))}
      {done.length ? <SectionHeading label="Done" /> : null}
      {done.map((task) => (
        <TaskRow key={task.id} task={task} assignee={assignee(task.assigneeMemberId)} onRecord />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter },
  title: { flex: 1 },
});
