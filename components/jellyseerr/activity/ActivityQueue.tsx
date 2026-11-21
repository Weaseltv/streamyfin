import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type LayoutChangeEvent, View } from "react-native";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Text } from "@/components/common/Text";
import { WeaselSeerrConnectState } from "@/components/jellyseerr/WeaselSeerrConnectState";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import type { JellyseerrApi } from "@/hooks/useJellyseerr";
import {
  POLICY_RETRY_TOO_SOON_EVENT,
  RETRY_POLICY_EVENT,
} from "@/providers/RequestPolicyRunner";
import { requestPolicyRunnerAtom } from "@/utils/atoms/requestPolicy";
import {
  type RequestQueueState,
  requestProgressAtom,
} from "@/utils/atoms/requestStatus";
import { eventBus } from "@/utils/eventBus";
import {
  ACTIVITY_SECTIONS,
  type ActivityRowView,
  activityRow,
  liveRecordFor,
  orderRows,
  sectionCounts,
} from "@/utils/requestStatus/activityRow";
import { createRowFormat } from "@/utils/requestStatus/format";
import { type RowMetadata, withMetadata } from "@/utils/requestStatus/metadata";
import { SYNC_ERROR_TEXT } from "@/utils/requestStatus/sync";
import { ActivityEmptyState, SectionHeading } from "./ActivityParts";
import { ActivityRow, requestTitleQuery } from "./ActivityRow";

const ACCENT = sectionAccent("requests");

/** The queue in display order, with each movie's availability date applied (the TV's metadata). */
export function useActivityRows(
  queue: RequestQueueState,
  client: JellyseerrApi | undefined,
): ActivityRowView[] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const fmt = useMemo(() => createRowFormat(), []);
  const progress = useAtomValue(requestProgressAtom);
  // Only movies still waiting for the library can turn into "Waiting for release".
  const candidates = useMemo(
    () =>
      queue.items.filter(
        (i) =>
          i.request.type === "movie" &&
          i.fresh &&
          i.stage.kind === "WAITING_LIBRARY",
      ),
    [queue.items],
  );
  const metadata = useQueries({
    queries: candidates.map((i) =>
      requestTitleQuery(client, queue.scopeKey, i.request),
    ),
  });
  const metaKey = metadata.map((m) => m.dataUpdatedAt).join(",");
  return useMemo(() => {
    const byId = new Map<number, RowMetadata | undefined>();
    for (const [n, i] of candidates.entries()) {
      byId.set(i.request.id, metadata[n]?.data);
    }
    const observed = new Set(queue.journal.downloadObserved);
    // The live overlay belongs to this scope only.
    const records =
      progress.scopeKey === queue.scopeKey ? progress.records : null;
    const rows = queue.items.map((item) => {
      const withMeta = withMetadata(item, byId.get(item.request.id), {
        downloadObserved: observed.has(item.request.id),
        nowMs: now,
      });
      const live = liveRecordFor(withMeta, records, progress.seerrUserId);
      return activityRow(
        withMeta,
        live,
        !!live && (live.stale || progress.transportStale),
        now,
        fmt,
      );
    });
    return orderRows(rows);
    // metaKey stands for the metadata results.
  }, [
    queue.items,
    queue.journal.downloadObserved,
    candidates,
    metaKey,
    now,
    fmt,
    progress,
  ]);
}

interface Props {
  queue: RequestQueueState;
  rows: ActivityRowView[];
  client: JellyseerrApi | undefined;
  /** How many Ready rows are rendered (30 at a time). */
  readyCount: number;
  highlightedId: number | null;
  /** A line above the queue (Watch now couldn't open, later cancel answers). */
  message: string | null;
  onOpen: (view: ActivityRowView, metadata: RowMetadata | undefined) => void;
  onRowLayout: (requestId: number, event: LayoutChangeEvent) => void;
  /** Whether a row may be offered "Cancel request" (plan 5.7). */
  isCancellable?: (view: ActivityRowView) => boolean;
  onCancel?: (view: ActivityRowView, metadata: RowMetadata | undefined) => void;
  /** Rows with a cancel in flight. */
  cancelling?: ReadonlySet<number>;
}

/** The queue part of the Requests page: its states, then Active, Waiting and Ready. */
export function ActivityQueue({
  queue,
  rows,
  client,
  readyCount,
  highlightedId,
  message,
  onOpen,
  onRowLayout,
  isCancellable,
  onCancel,
  cancelling,
}: Props) {
  const { t } = useTranslation();
  const runner = useAtomValue(requestPolicyRunnerAtom);
  const [tooSoon, setTooSoon] = useState(false);
  useEffect(
    () => eventBus.on(POLICY_RETRY_TOO_SOON_EVENT, () => setTooSoon(true)),
    [],
  );

  if (queue.phase === "policy") {
    if (runner.status === "checking" && !tooSoon) {
      return (
        <EmptyState
          icon='loader'
          accent={ACCENT}
          title={t("search.requests_connecting_title")}
          detail={t("search.requests_connecting_detail")}
        />
      );
    }
    return (
      <EmptyState
        icon='wifi-off'
        accent={ACCENT}
        title={t("search.requests_unavailable_title")}
        detail={
          tooSoon
            ? t("request_status.state.still_checking")
            : t("search.requests_unavailable_detail")
        }
        action={
          <Button
            variant='border'
            accent={ACCENT}
            onPress={() => {
              setTooSoon(false);
              eventBus.emit(RETRY_POLICY_EVENT);
            }}
          >
            {t("home.retry")}
          </Button>
        }
      />
    );
  }
  if (queue.phase === "idle") return null;
  if (queue.phase === "connect" && !queue.verified)
    return <WeaselSeerrConnectState accent={ACCENT} />;
  if (queue.phase === "sign_in_again") {
    return <StateLine text={t("request_status.state.sign_in_again")} />;
  }
  if (queue.phase === "unavailable") {
    return <StateLine text={t("request_status.state.couldnt_load")} />;
  }

  const reconnecting =
    queue.phase === "reconnecting" || queue.phase === "connect";
  const counts = sectionCounts(rows);
  const error =
    queue.error === "unavailable"
      ? "request_status.error.unavailable"
      : queue.error
        ? SYNC_ERROR_TEXT[queue.error]
        : null;

  let body: React.ReactNode;
  if (queue.verified && rows.length > 0) {
    body = ACTIVITY_SECTIONS.map((section) => {
      const inSection = rows.filter((r) => r.section === section);
      if (inSection.length === 0) return null;
      const shown =
        section === "READY" ? inSection.slice(0, readyCount) : inSection;
      // Flat (no wrapper per section), so each row's measured offset is relative to the queue.
      return (
        <Fragment key={section}>
          <SectionHeading section={section} count={counts[section]} />
          {shown.map((view) => (
            <ActivityRow
              key={view.item.request.id}
              view={view}
              client={client}
              scopeKey={queue.scopeKey}
              disabled={reconnecting}
              highlighted={highlightedId === view.item.request.id}
              onOpen={onOpen}
              onLayout={onRowLayout}
              cancellable={!reconnecting && (isCancellable?.(view) ?? false)}
              onCancel={onCancel}
              inert={cancelling?.has(view.item.request.id) ?? false}
            />
          ))}
        </Fragment>
      );
    });
  } else if (
    queue.verified &&
    queue.lastUpdated !== null &&
    queue.syncComplete &&
    !queue.error &&
    !reconnecting
  ) {
    body = <ActivityEmptyState />;
  } else {
    body = (
      <StateLine
        text={
          queue.lastUpdated === null && !queue.error
            ? t("request_status.state.loading")
            : t("request_status.state.couldnt_load")
        }
      />
    );
  }

  return (
    <View style={{ paddingHorizontal: Sizes.gutter }}>
      {message ? <Line text={message} color={NeonBoard.warn} live /> : null}
      {error ? <Line text={t(error)} color={NeonBoard.red} /> : null}
      {reconnecting ? (
        <Line
          text={t("request_status.state.reconnecting")}
          color={NeonBoard.mid}
        />
      ) : null}
      {body}
    </View>
  );
}

function Line({
  text,
  color,
  live,
}: {
  text: string;
  color: string;
  live?: boolean;
}) {
  return (
    <Text
      variant='caption'
      accessibilityLiveRegion={live ? "polite" : "none"}
      style={{ color, paddingTop: 8 }}
    >
      {text}
    </Text>
  );
}

function StateLine({ text }: { text: string }) {
  return (
    <Text
      variant='body'
      muted
      style={{ textAlign: "center", paddingTop: 24, paddingHorizontal: 32 }}
    >
      {text}
    </Text>
  );
}
