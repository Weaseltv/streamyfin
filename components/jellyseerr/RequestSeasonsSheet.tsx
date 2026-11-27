import { Feather } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions, View } from "react-native";
import { Button } from "@/components/Button";
import { NeonSheet, neonSheetModalProps } from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { SeasonPickerList } from "@/components/jellyseerr/RequestModal";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { SHEET_MAX_HEIGHT_RATIO } from "@/constants/Values";
import {
  RequestSubmitError,
  useSubmitOwnRequest,
} from "@/hooks/useSubmitOwnRequest";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import {
  pickableSeasonNumbers,
  type RequestSeason,
} from "@/utils/requestSeasons";

const ACCENT = sectionAccent("requests");

/** More seasons than this and a second Submit follows the list, as on the TV. */
const BOTTOM_SUBMIT_AFTER = 3;

export interface RequestSeasonsSheetHandle {
  /** Opens the sheet with these seasons ticked (anything ticked before is dropped). */
  present: (selected: number[]) => void;
}

interface Props {
  mediaId: number;
  tvdbId?: number;
  title: string;
  posterUrl?: string | null;
  year?: string | number | null;
  /** The show's seasons without specials (`requestSeasonsFor`). */
  seasons: RequestSeason[];
  /** After the request is sent and the sheet has closed. */
  onRequested?: () => void;
}

/**
 * Phones: the show's season picker, matching the TV's request dialog. Submit at the top (and
 * again under the list when there are more than three seasons), the "Seasons" list with Select
 * all, one checkbox row per season. Submit sends one request with exactly the ticked seasons;
 * it is disabled until a season is ticked and shows "Submitting…" while sending. On failure the
 * error shows here and the ticks are kept; nothing is resent automatically.
 */
const RequestSeasonsSheet = forwardRef<RequestSeasonsSheetHandle, Props>(
  ({ mediaId, tvdbId, title, posterUrl, year, seasons, onRequested }, ref) => {
    const { t } = useTranslation();
    const { height: windowHeight } = useWindowDimensions();
    const modalRef = useRef<BottomSheetModal>(null);
    const { submit, submitting } = useSubmitOwnRequest();
    const [selected, setSelected] = useState<number[]>([]);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: (initial: number[]) => {
          setSelected(initial);
          setSubmitError(null);
          modalRef.current?.present();
        },
      }),
      [],
    );

    // Only seasons that can still be requested: the page refreshes the show while the sheet is
    // open, and a ticked season may have been requested from elsewhere in the meantime.
    const ticked = useMemo(() => {
      const pickable = pickableSeasonNumbers(seasons);
      return selected.filter((n) => pickable.includes(n)).sort((a, b) => a - b);
    }, [seasons, selected]);

    const send = useCallback(() => {
      if (submitting || ticked.length === 0) return;
      const body: MediaRequestBody = {
        mediaId,
        mediaType: MediaType.TV,
        tvdbId,
        seasons: ticked,
      };
      setSubmitError(null);
      submit(body, { title, posterUrl, year })
        .then((outcome) => {
          if (outcome !== "sent") return;
          modalRef.current?.close();
          onRequested?.();
        })
        .catch((e) => {
          const text =
            e instanceof RequestSubmitError
              ? e.text
              : { key: "request_status.submission.unconfirmed" };
          setSubmitError(t(text.key, text.params));
        });
    }, [
      submitting,
      ticked,
      mediaId,
      tvdbId,
      submit,
      title,
      posterUrl,
      year,
      onRequested,
      t,
    ]);

    const submitButton = (
      <Button
        accent={ACCENT}
        onPress={send}
        disabled={ticked.length === 0 || submitting}
        iconLeft={<Feather name='inbox' size={18} color={NeonBoard.onAccent} />}
      >
        {submitting
          ? t("request_status.submission.submitting")
          : t("jellyseerr.submit_button")}
      </Button>
    );

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        maxDynamicContentSize={windowHeight * SHEET_MAX_HEIGHT_RATIO}
        enableDismissOnClose
        {...neonSheetModalProps}
        stackBehavior='push'
      >
        <NeonSheet
          scroll
          eyebrow={`${t("jellyseerr.request_button")} · ${t("search.series")}`}
          title={title}
          accent={ACCENT}
          onClose={() => modalRef.current?.close()}
          primary={seasons.length > BOTTOM_SUBMIT_AFTER ? submitButton : null}
        >
          {submitError ? (
            <Text
              variant='caption'
              accessibilityLiveRegion='polite'
              style={{
                color: NeonBoard.red,
                paddingHorizontal: Sizes.gutter,
                paddingTop: 12,
              }}
            >
              {submitError}
            </Text>
          ) : null}
          <View style={{ paddingHorizontal: Sizes.gutter, paddingTop: 16 }}>
            {submitButton}
          </View>
          <SeasonPickerList
            seasons={seasons}
            selected={selected}
            onChange={setSelected}
            disabled={submitting}
            accent={ACCENT}
          />
        </NeonSheet>
      </BottomSheetModal>
    );
  },
);

export default RequestSeasonsSheet;
