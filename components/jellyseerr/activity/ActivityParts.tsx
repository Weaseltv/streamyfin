import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import type {
  ActivitySection,
  ActivityProgress as Progress,
} from "@/utils/requestStatus/activityRow";
import { SECTION_LABEL } from "@/utils/requestStatus/activityRow";

/** The TV's Activity colours (`RequestActivityPalette`). */
export const ActivityPalette = {
  ACTIVE: "#00A3FF",
  WAITING: "#FFC400",
  READY: "#00E04B",
  movie: "#00E1FF",
  series: "#FF1A1A",
} as const;

export const sectionColor = (section: ActivitySection) =>
  ActivityPalette[section];

/** Bar and percentage, a note, or a dash (the row's right-hand column). */
export function ActivityProgress({
  progress,
  color,
}: {
  progress: Progress;
  color: string;
}) {
  const { t } = useTranslation();
  if (progress.kind === "bar") {
    const percent = Math.floor(progress.fraction * 100 + 1e-9);
    return (
      <View style={styles.barRow}>
        <View
          accessible
          accessibilityRole='progressbar'
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={styles.barTrack}
        >
          <View
            style={[
              styles.barFill,
              { width: `${percent}%`, backgroundColor: color },
            ]}
          />
        </View>
        <Text
          variant='caption'
          accessibilityElementsHidden
          importantForAccessibility='no'
          style={{ color, fontWeight: "700", minWidth: 34, textAlign: "right" }}
        >
          {percent}%
        </Text>
      </View>
    );
  }
  if (progress.kind === "note") {
    return (
      <Text
        variant='caption'
        numberOfLines={2}
        style={{
          color: progress.emphasized ? NeonBoard.text : NeonBoard.mid,
          textAlign: "right",
        }}
      >
        {t(progress.text.key, progress.text.params)}
      </Text>
    );
  }
  return (
    <Text variant='caption' muted style={{ textAlign: "right" }}>
      —
    </Text>
  );
}

/** "Watch now": filled for Ready, outlined for a partly ready show. */
export function WatchNowPill({ solid }: { solid: boolean }) {
  const { t } = useTranslation();
  const content = solid ? NeonBoard.stage : NeonBoard.text;
  return (
    <View
      style={[
        styles.pill,
        solid
          ? { backgroundColor: NeonBoard.text }
          : { borderWidth: 1, borderColor: NeonBoard.text },
      ]}
    >
      <Feather name='play' size={12} color={content} />
      <Text variant='caption' style={{ color: content, fontWeight: "700" }}>
        {t("request_status.row.watch_now")}
      </Text>
    </View>
  );
}

/** A section heading: dot, name, count and a rule. */
export function SectionHeading({
  section,
  count,
}: {
  section: ActivitySection;
  count: number;
}) {
  const { t } = useTranslation();
  const color = sectionColor(section);
  return (
    <View accessibilityRole='header' style={styles.heading}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant='section' style={{ color }}>
        {t(SECTION_LABEL[section])}
      </Text>
      <Text variant='count' muted>
        {count}
      </Text>
      <View style={styles.rule} />
    </View>
  );
}

/** Nothing requested yet: two help lines and the colour legend (the TV's, without the mic). */
export function ActivityEmptyState() {
  const { t } = useTranslation();
  const legend: [ActivitySection, string][] = [
    ["ACTIVE", "request_status.empty.legend_active"],
    ["WAITING", "request_status.empty.legend_waiting"],
    ["READY", "request_status.empty.legend_ready"],
  ];
  return (
    <View style={styles.empty}>
      <Text variant='section' style={{ textAlign: "center", letterSpacing: 1 }}>
        {t("request_status.empty.title")}
      </Text>
      <Text variant='body' muted style={{ textAlign: "center", marginTop: 16 }}>
        {t("request_status.empty.search_above")}
      </Text>
      <Text variant='body' muted style={{ textAlign: "center", marginTop: 2 }}>
        {t("request_status.empty.follow_here")}
      </Text>
      <View style={styles.legend}>
        {legend.map(([section, key]) => (
          <View key={section} style={styles.legendItem}>
            <View
              style={[styles.dot, { backgroundColor: sectionColor(section) }]}
            />
            <Text
              variant='caption'
              style={{ color: sectionColor(section), fontWeight: "700" }}
            >
              {t(SECTION_LABEL[section])}
            </Text>
            <Text variant='caption' muted>
              {t(key)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  barTrack: {
    width: 64,
    height: 6,
    borderRadius: 3,
    backgroundColor: NeonBoard.line2,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 13,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 20,
    paddingBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rule: { flex: 1, height: 1, backgroundColor: NeonBoard.line },
  empty: { alignItems: "center", paddingHorizontal: 24, paddingTop: 40 },
  legend: { marginTop: 24, gap: 8, alignItems: "flex-start" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
});
