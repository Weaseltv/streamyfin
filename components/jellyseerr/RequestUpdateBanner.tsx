import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNeonTabBarLayout } from "@/components/common/NeonTabBar";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { useOpenRequestRow } from "@/hooks/useRequestStatus";
import {
  requestQueueAtom,
  requestSubmissionAtom,
} from "@/utils/atoms/requestStatus";
import { store } from "@/utils/store";

/** "Request sent" stays this long, then the queue opens on the new row (owner decision 7). */
export const SUBMISSION_CARD_MS = 6_000;

const ACCENT = sectionAccent("requests");

/**
 * The card above the tab bar (plan 5.9; the TV's `RequestNotificationCard`). This pull request uses
 * it for "Request sent": the title, its type line, "We'll let you know when it's ready to watch."
 * and a draining bar; no buttons; not affected by the notifications setting.
 */
export function RequestUpdateBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bar = useNeonTabBarLayout();
  const card = useAtomValue(requestSubmissionAtom);
  const openRow = useOpenRequestRow();
  const drain = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!card) return;
    const left = Math.max(
      0,
      SUBMISSION_CARD_MS - (Date.now() - card.createdAt),
    );
    drain.setValue(left / SUBMISSION_CARD_MS);
    const animation = Animated.timing(drain, {
      toValue: 0,
      duration: left,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start();
    const timer = setTimeout(() => {
      if (store.get(requestSubmissionAtom) !== card) return;
      store.set(requestSubmissionAtom, null);
      // Only for the scope it was made in.
      if (store.get(requestQueueAtom).scopeKey === card.scopeKey)
        openRow(card.requestId);
    }, left);
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [card, drain, openRow]);

  // A member or server change drops it.
  const scopeKey = useAtomValue(requestQueueAtom).scopeKey;
  useEffect(() => {
    if (card && scopeKey !== card.scopeKey)
      store.set(requestSubmissionAtom, null);
  }, [card, scopeKey]);

  if (!card) return null;
  const meta = [
    card.year,
    t(
      card.mediaType === "tv"
        ? "request_status.card.tv_series"
        : "request_status.card.movie",
    ),
    card.is4k ? t("request_status.row.four_k") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      pointerEvents='box-none'
      style={[styles.host, { bottom: bar.height + insets.bottom + 8 }]}
    >
      <View accessibilityLiveRegion='polite' accessible style={styles.card}>
        <View style={styles.row}>
          <View style={styles.poster}>
            {card.posterUrl ? (
              <Image
                source={{ uri: card.posterUrl }}
                style={styles.poster}
                contentFit='cover'
              />
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              variant='caption'
              style={{ color: ACCENT, fontWeight: "700" }}
            >
              {t("request_status.card.request_sent")}
            </Text>
            <Text
              variant='body'
              numberOfLines={1}
              style={{ fontWeight: "700" }}
            >
              {card.title}
            </Text>
            <Text variant='caption' muted numberOfLines={1}>
              {meta}
            </Text>
            <Text
              variant='caption'
              muted
              numberOfLines={2}
              style={{ marginTop: 2 }}
            >
              {t("request_status.card.confirmation")}
            </Text>
          </View>
        </View>
        <Animated.View
          style={[
            styles.drain,
            {
              width: drain.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 12, right: 12 },
  card: {
    backgroundColor: "#0B0E13",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ACCENT,
    overflow: "hidden",
  },
  row: { flexDirection: "row", gap: 12, padding: 12 },
  poster: { width: 40, height: 60, backgroundColor: NeonBoard.card2 },
  drain: { height: 2, backgroundColor: ACCENT },
});
