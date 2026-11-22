import { t } from "i18next";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner-native";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { requestSubmissionBlock } from "@/hooks/useRequestStatus";
import { requestScopeBridge } from "@/providers/RequestStatusCoordinator";
import {
  requestQueueAtom,
  requestSubmissionAtom,
} from "@/utils/atoms/requestStatus";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import { submissionErrorText } from "@/utils/requestStatus/submissionError";
import type { OwnRequest, Text } from "@/utils/requestStatus/types";
import { store } from "@/utils/store";

/** Why a request couldn't be sent, in the TV's words (`request_status.submission.*`). */
export class RequestSubmitError extends Error {
  constructor(readonly text: Text) {
    super(text.key);
    this.name = "RequestSubmitError";
  }
}

export interface SubmitPresentation {
  title: string;
  posterUrl?: string | null;
  year?: string | number | null;
}

/**
 * Phones (plan 5.8): send a request through this person's verified session. Repeats are ignored
 * while one is in flight; a failure throws `RequestSubmitError` and nothing is resent. After the
 * POST the scope is checked again: an own request is seeded (so its first ready shows), "Request
 * sent" shows for 6 s and then the queue opens on its row. A request made for another member
 * (advanced "request as") is not seeded and does not navigate. `requestMedia` and the TV builds
 * are untouched.
 */
export function useSubmitOwnRequest() {
  const { jellyseerrApi } = useJellyseerr();
  const queryClient = useNetworkAwareQueryClient();
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (
      body: MediaRequestBody,
      presentation: SubmitPresentation,
    ): Promise<"sent" | "ignored"> => {
      if (inFlight.current) return "ignored";
      const blocked = requestSubmissionBlock();
      if (blocked || !jellyseerrApi) {
        throw new RequestSubmitError(
          blocked ?? { key: "request_status.submission.reconnecting" },
        );
      }
      const start = store.get(requestQueueAtom);
      inFlight.current = true;
      setSubmitting(true);
      let created: OwnRequest;
      try {
        created = (await jellyseerrApi.request(body)) as unknown as OwnRequest;
      } catch (error) {
        throw new RequestSubmitError(submissionErrorText(error));
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
      await queryClient.invalidateQueries({
        queryKey: ["search", "jellyseerr"],
      });

      // The scope must be the same after the POST before anything is seeded.
      const now = store.get(requestQueueAtom);
      const sameScope =
        now.verified && now.scopeKey === start.scopeKey && !!now.scopeKey;
      const seeded =
        sameScope && (requestScopeBridge()?.seed(created) ?? false);
      if (seeded && now.scopeKey) {
        store.set(requestSubmissionAtom, {
          scopeKey: now.scopeKey,
          requestId: created.id,
          title: presentation.title,
          posterUrl: presentation.posterUrl ?? null,
          year:
            presentation.year != null && presentation.year !== ""
              ? String(presentation.year)
              : null,
          mediaType: created.type,
          is4k: created.is4k === true,
          createdAt: Date.now(),
        });
      } else if (created.requestedBy?.id !== start.seerrUserId) {
        // Made for another member: no card, no navigation.
        toast.success(
          t("jellyseerr.toasts.requested_item", { item: presentation.title }),
        );
      }
      return "sent";
    },
    [jellyseerrApi, queryClient],
  );

  return { submit, submitting };
}

/** Show a submit failure as a toast (screens without a sheet to keep it in). */
export function toastSubmitError(error: unknown) {
  const text =
    error instanceof RequestSubmitError
      ? error.text
      : { key: "request_status.submission.unconfirmed" };
  toast.error(t(text.key, text.params));
}
