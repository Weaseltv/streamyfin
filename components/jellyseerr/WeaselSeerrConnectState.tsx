import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/common/EmptyState";
import {
  useRetryWeaselSeerrConnect,
  weaselSeerrConnectStatusAtom,
} from "@/hooks/useWeaselSeerrAutoConnect";

interface Props {
  accent: string;
}

/**
 * WeaselPlex: what the Requests screen shows while there is no Seerr session.
 * Explains the silent connect's outcome (connecting, refused, unreachable)
 * and offers a Retry that runs it again without waiting for the next launch.
 */
export const WeaselSeerrConnectState: React.FC<Props> = ({ accent }) => {
  const { t } = useTranslation();
  const status = useAtomValue(weaselSeerrConnectStatusAtom);
  const retry = useRetryWeaselSeerrConnect();
  // A Retry that is still refused keeps the status at `refused`, so the
  // only way to tell the customer it did nothing is to remember the tap.
  const [retriedWhileRefused, setRetriedWhileRefused] = useState(false);

  if (status === "connecting") {
    return (
      <EmptyState
        icon='loader'
        accent={accent}
        title={t("search.requests_connecting_title")}
        detail={t("search.requests_connecting_detail")}
      />
    );
  }

  const refused = status === "refused";
  return (
    <EmptyState
      icon={refused ? "user-x" : "wifi-off"}
      accent={accent}
      title={
        refused
          ? t("search.requests_not_enabled_title")
          : t("search.requests_unavailable_title")
      }
      detail={
        refused
          ? retriedWhileRefused
            ? t("search.requests_retry_wait")
            : t("search.requests_not_enabled_detail")
          : t("search.requests_unavailable_detail")
      }
      action={
        <Button
          variant='border'
          accent={accent}
          onPress={() => {
            setRetriedWhileRefused(refused);
            retry();
          }}
        >
          {t("home.retry")}
        </Button>
      }
    />
  );
};
