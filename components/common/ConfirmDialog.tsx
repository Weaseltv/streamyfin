import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, TouchableOpacity, View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Scrims, Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { Loader } from "../Loader";
import { Text } from "./Text";

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string | null;
  /** Defaults to `common.ok`; delete / log out / clear cache pass their own. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red tally and a red action label. */
  destructive?: boolean;
  /** Accent for non-destructive confirms. Defaults to volt. */
  accent?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const PANEL_WIDTH = 320;

/**
 * The P14 confirm dialog: a centred 320 `card` panel with a 1pt `line2`
 * border, a 3pt tally (red for destructive actions), Condensed 22 title,
 * 13 `mid` body and a 48 hairline button row (CANCEL in `text`, the action
 * in red or the accent). Flat `stage` scrim, no blur.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  accent: accentProp,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const accent = useAccent(accentProp);
  const { t } = useTranslation();
  const tone = destructive ? NeonBoard.red : accent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable
        onPress={loading ? undefined : onCancel}
        style={{
          flex: 1,
          backgroundColor: Scrims.modal,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
        accessibilityRole='button'
        accessibilityLabel={cancelLabel ?? t("common.cancel")}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: PANEL_WIDTH,
            backgroundColor: NeonBoard.card,
            borderWidth: 1,
            borderColor: NeonBoard.line2,
          }}
        >
          <View
            style={{
              paddingLeft: Sizes.rowLead,
              paddingRight: Sizes.rowLead,
              paddingTop: 18,
              paddingBottom: 18,
            }}
          >
            <View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: Sizes.tally,
                  backgroundColor: tone,
                },
                glowRule(tone),
              ]}
            />
            <Text
              variant='pageTitle'
              style={{ fontSize: 22, lineHeight: 24 }}
              numberOfLines={3}
            >
              {title}
            </Text>
            {message ? (
              <Text
                variant='body'
                muted
                style={{ fontSize: 13, lineHeight: 18, marginTop: 8 }}
              >
                {message}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: "row",
              height: Sizes.button,
              borderTopWidth: 1,
              borderTopColor: NeonBoard.line,
            }}
          >
            <TouchableOpacity
              onPress={onCancel}
              disabled={loading}
              accessibilityRole='button'
              activeOpacity={0.7}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRightWidth: 1,
                borderRightColor: NeonBoard.line,
              }}
            >
              <Text variant='button' allowFontScaling={false}>
                {cancelLabel ?? t("common.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={loading}
              accessibilityRole='button'
              activeOpacity={0.7}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {loading ? (
                <Loader color={tone} />
              ) : (
                <Text
                  variant='button'
                  allowFontScaling={false}
                  style={{ color: tone }}
                >
                  {confirmLabel ?? t("common.ok")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

interface ConfirmRequest {
  title: string;
  message?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  accent?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Imperative helper for pages: `const { confirm, dialog } = useConfirmDialog();`
 * then render `{dialog}` once and call `confirm({...})` from any handler.
 */
export const useConfirmDialog = (): {
  confirm: (request: ConfirmRequest) => void;
  dialog: ReactNode;
} => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((next: ConfirmRequest) => {
    setLoading(false);
    setRequest(next);
  }, []);

  const close = useCallback(() => {
    setRequest(null);
    setLoading(false);
  }, []);

  const dialog = request ? (
    <ConfirmDialog
      visible
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      destructive={request.destructive}
      accent={request.accent}
      loading={loading}
      onCancel={() => {
        request.onCancel?.();
        close();
      }}
      onConfirm={async () => {
        const result = request.onConfirm();
        if (result && typeof (result as Promise<void>).then === "function") {
          setLoading(true);
          try {
            await result;
          } finally {
            close();
          }
        } else {
          close();
        }
      }}
    />
  ) : null;

  return { confirm, dialog };
};
