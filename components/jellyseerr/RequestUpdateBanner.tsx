import { useIsFocused } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  AppState,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNeonTabBarLayout } from "@/components/common/NeonTabBar";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { requestTitleQuery } from "@/components/jellyseerr/activity/ActivityRow";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  acknowledgeRequestEvents,
  useOpenRequestRow,
} from "@/hooks/useRequestStatus";
import {
  requestLiveGateAtom,
  requestQueueAtom,
  requestSubmissionAtom,
} from "@/utils/atoms/requestStatus";
import {
  CARD_VISIBLE_MS,
  type CardModel,
  cardMayShow,
  cardModel,
} from "@/utils/requestStatus/card";
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

  if (!card) return <ReadyCard bottom={bar.height + insets.bottom + 8} />;
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  primary: {
    height: 32,
    paddingHorizontal: 16,
    justifyContent: "center",
    backgroundColor: NeonBoard.text,
  },
  dismiss: { height: 32, paddingHorizontal: 8, justifyContent: "center" },
});

/**
 * The request update card (plan 5.9): the TV's content and wording, one minute (touching it resets
 * the minute), shown only when the tabs are in front, the app is active, the keyboard is closed
 * and no sheet is open; an unsafe moment hides it and leaves the update pending. It never
 * navigates by itself. Dismiss and timeout acknowledge without clearing unread; the primary
 * action also clears unread and navigates.
 */
function ReadyCard({ bottom }: { bottom: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const openRow = useOpenRequestRow();
  const queue = useAtomValue(requestQueueAtom);
  const sheetOpen = useAtomValue(requestLiveGateAtom).sheetOpen;
  const tabsFocused = useIsFocused();
  const { jellyseerrApi: client } = useJellyseerr();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardOpen(false),
    );
    const app = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => {
      show.remove();
      hide.remove();
      app.remove();
    };
  }, []);

  const model: CardModel | null = useMemo(
    () =>
      queue.verified && queue.journal.enabled
        ? cardModel(queue.journal.pending, queue.items)
        : null,
    [queue.verified, queue.journal.enabled, queue.journal.pending, queue.items],
  );
  const eventsKey = model?.events.map((e) => e.key).join(",") ?? "";
  const show =
    !!model &&
    cardMayShow({
      tabsFocused,
      appActive,
      keyboardOpen,
      sheetOpen,
      submissionShowing: false,
    });

  // The minute runs while the card is on screen; an unsafe moment starts it again later.
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    setShownAt(show ? Date.now() : null);
  }, [show, eventsKey]);
  const drain = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!show || shownAt === null || !model) return;
    const left = Math.max(0, CARD_VISIBLE_MS - (Date.now() - shownAt));
    drain.setValue(left / CARD_VISIBLE_MS);
    const animation = Animated.timing(drain, {
      toValue: 0,
      duration: left,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start();
    const events = model.events;
    const timer = setTimeout(
      () => acknowledgeRequestEvents(events, "keep"),
      left,
    );
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [show, shownAt, eventsKey]);

  const single = model?.single ?? null;
  const titleQuery = single
    ? requestTitleQuery(client, queue.scopeKey, single.request)
    : null;
  const { data: metadata } = useQuery({
    queryKey: titleQuery?.queryKey ?? ["requestStatus", "title", "none"],
    queryFn: titleQuery?.queryFn ?? (async () => null),
    enabled: !!titleQuery?.enabled,
    staleTime: 60 * 60 * 1000,
  });

  if (!show || !model) return null;
  const typeLine = single
    ? [
        metadata?.year ?? null,
        t(
          single.request.type === "tv"
            ? "request_status.card.tv_series"
            : "request_status.card.movie",
        ),
        single.request.is4k ? t("request_status.row.four_k") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const title = model.title
    ? t(model.title.key, model.title.params)
    : (metadata?.title ??
      t(
        single?.request.type === "tv"
          ? "request_status.row.requested_show"
          : "request_status.row.requested_movie",
      ));
  const poster = metadata?.posterPath
    ? client?.imageProxy(metadata.posterPath, "w300_and_h450_face", 200)
    : null;

  const onPrimary = () => {
    const p = model.primary;
    acknowledgeRequestEvents(
      model.events,
      p.kind === "view_all" ? "all" : p.requestId,
    );
    if (p.kind === "watch") {
      router.push(
        p.mediaType === "tv"
          ? {
              pathname: "/(auth)/(tabs)/(requests)/series/[id]",
              params: { id: p.itemId },
            }
          : {
              pathname: "/(auth)/(tabs)/(requests)/items/page",
              params: { id: p.itemId },
            },
      );
    } else {
      openRow(p.kind === "details" ? p.requestId : null);
    }
  };

  return (
    <View pointerEvents='box-none' style={[styles.host, { bottom }]}>
      <View
        accessibilityLiveRegion='polite'
        style={styles.card}
        onTouchStart={() => setShownAt(Date.now())}
      >
        <View style={styles.row}>
          <View style={styles.poster}>
            {poster ? (
              <Image
                source={{ uri: poster }}
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
              {t(model.status.key, model.status.params)}
            </Text>
            <Text
              variant='body'
              numberOfLines={1}
              style={{ fontWeight: "700" }}
            >
              {title}
            </Text>
            {typeLine ? (
              <Text variant='caption' muted numberOfLines={1}>
                {typeLine}
              </Text>
            ) : null}
            <Text
              variant='caption'
              muted
              numberOfLines={2}
              style={{ marginTop: 2 }}
            >
              {t(model.instruction.key)}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole='button'
            onPress={onPrimary}
            style={({ pressed }) => [
              styles.primary,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text
              variant='caption'
              style={{ color: NeonBoard.stage, fontWeight: "700" }}
            >
              {t(model.primaryLabel.key)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole='button'
            onPress={() => acknowledgeRequestEvents(model.events, "keep")}
            style={({ pressed }) => [
              styles.dismiss,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              variant='caption'
              muted
              style={{ fontWeight: "700", letterSpacing: 1 }}
            >
              {t("request_status.card.dismiss")}
            </Text>
          </Pressable>
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
