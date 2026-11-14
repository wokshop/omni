import type { Mailbox } from "@omni/client";
import type { ComponentType } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { SvgProps } from "react-native-svg";
import { IconCheck, IconInbox, IconShared } from "@/components/icons.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Text } from "@/components/ui/text.tsx";
import { mailboxName } from "@/lib/mail.ts";
import { colors, iconSize, radius, space } from "@/theme/tokens.ts";

export interface MailboxListProps {
  mailboxes: Mailbox[];
  /** Unread inbox threads per mailbox id. */
  unread: Map<string, number>;
  current: string | undefined;
  you: string;
  onSelect: (mailboxId: string | undefined) => void;
}

/** Every inbox the person can open, and "All mailboxes" above them. */
export function MailboxList({ mailboxes, unread, current, you, onSelect }: MailboxListProps) {
  const total = [...unread.values()].reduce((sum, n) => sum + n, 0);
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Row
        icon={IconInbox}
        name="All mailboxes"
        count={total}
        current={current === undefined}
        onPress={() => onSelect(undefined)}
      />
      {mailboxes.map((mailbox) => (
        <Row
          key={mailbox.id}
          icon={mailbox.kind === "shared" ? IconShared : undefined}
          avatar={mailbox.kind === "personal" ? you : undefined}
          name={mailboxName(mailbox, you)}
          detail={mailbox.address}
          count={unread.get(mailbox.id) ?? 0}
          current={current === mailbox.id}
          onPress={() => onSelect(mailbox.id)}
        />
      ))}
    </ScrollView>
  );
}

function Row(props: {
  icon?: ComponentType<SvgProps & { size?: number }>;
  avatar?: string;
  name: string;
  detail?: string;
  count: number;
  current: boolean;
  onPress: () => void;
}) {
  const Icon = props.icon;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.current }}
      style={({ pressed }) => [styles.row, (props.current || pressed) && styles.current]}
    >
      <View style={styles.lead}>
        {props.avatar !== undefined ? (
          <Avatar name={props.avatar} size={28} />
        ) : Icon ? (
          <Icon
            size={iconSize.md}
            color={props.current ? colors.foreground : colors.mutedForeground}
          />
        ) : null}
      </View>
      <View style={styles.body}>
        <Text weight={props.current ? "medium" : "regular"} numberOfLines={1}>
          {props.name}
        </Text>
        {props.detail ? (
          <Text size="sm" tone="mutedForeground" numberOfLines={1}>
            {props.detail}
          </Text>
        ) : null}
      </View>
      {props.count > 0 ? <Badge count={props.count} /> : null}
      {props.current ? <IconCheck size={iconSize.md} color={colors.foreground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: space(3), gap: space(1) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    minHeight: 52,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.field,
  },
  current: { backgroundColor: colors.accent },
  lead: { width: 28, alignItems: "center" },
  body: { flex: 1 },
});
