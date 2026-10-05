import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { FontFace } from "@/constants/neon";
import {
  getAlphabetTouchLetter,
  LIBRARY_ALPHABET,
} from "@/utils/libraryAlphabet";

type Props = {
  accent: string;
  activeLetter?: string;
  availableLetters: readonly string[];
  descending: boolean;
  top: number;
  loading: boolean;
  failed: boolean;
  pickerOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetry: () => void;
  onSelect: (letter: string) => void;
};

export function LibraryAlphabetPicker({
  accent,
  activeLetter,
  availableLetters,
  descending,
  top,
  loading,
  failed,
  pickerOpen,
  onOpen,
  onClose,
  onRetry,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const letters = descending
    ? [...LIBRARY_ALPHABET].reverse()
    : LIBRARY_ALPHABET;
  const [height, setHeight] = useState(0);
  const [preview, setPreview] = useState<string>();
  const previewRef = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const compact = height > 0 && height < 324;
  const enabled = (letter: string) =>
    !loading && !failed && availableLetters.includes(letter);

  const selectAt = (y: number) => {
    const letter = getAlphabetTouchLetter(y, height, letters);
    if (!letter || !enabled(letter)) return;
    previewRef.current = letter;
    setPreview(letter);
  };
  const select = (letter: string) => {
    if (!enabled(letter)) return;
    onSelect(letter);
    onClose();
  };

  return (
    <>
      <View
        pointerEvents='box-none'
        style={[styles.container, { top, right: insets.right + 2 }]}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        {loading || failed || compact ? (
          <Pressable
            style={styles.compact}
            accessibilityRole='button'
            accessibilityLabel={
              failed ? t("library.alphabet.retry") : t("library.alphabet.title")
            }
            onPress={failed ? onRetry : onOpen}
          >
            {loading ? (
              <ActivityIndicator size='small' color={accent} />
            ) : (
              <Text
                allowFontScaling={false}
                accent={accent}
                style={{ fontSize: 12 }}
              >
                {failed ? "↻" : "A–Z"}
              </Text>
            )}
          </Pressable>
        ) : (
          <View
            style={styles.rail}
            accessible
            accessibilityRole='adjustable'
            accessibilityLabel={t("library.alphabet.title")}
            accessibilityHint={t("library.alphabet.hint")}
            accessibilityValue={{ text: activeLetter ?? "" }}
            accessibilityActions={[
              { name: "increment" },
              { name: "decrement" },
              { name: "activate" },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === "activate") {
                onOpen();
                return;
              }
              const available = letters.filter(enabled);
              const current = available.indexOf(activeLetter ?? "");
              const step = nativeEvent.actionName === "decrement" ? -1 : 1;
              const next =
                available[
                  Math.max(0, Math.min(available.length - 1, current + step))
                ];
              if (next) select(next);
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(event) => {
              clearTimeout(timer.current);
              previewRef.current = undefined;
              selectAt(event.nativeEvent.locationY);
            }}
            onResponderMove={(event) => selectAt(event.nativeEvent.locationY)}
            onResponderRelease={() => {
              if (previewRef.current) select(previewRef.current);
              timer.current = setTimeout(() => setPreview(undefined), 500);
            }}
            onResponderTerminate={() => {
              previewRef.current = undefined;
              setPreview(undefined);
            }}
          >
            {letters.map((letter) => (
              <View key={letter} pointerEvents='none' style={styles.letter}>
                <RNText
                  allowFontScaling={false}
                  style={[
                    styles.letterText,
                    {
                      color: !enabled(letter)
                        ? NeonBoard.line2
                        : (preview ?? activeLetter) === letter
                          ? accent
                          : NeonBoard.mid,
                    },
                  ]}
                >
                  {letter}
                </RNText>
              </View>
            ))}
          </View>
        )}
        {preview && !loading && !compact && (
          <View
            pointerEvents='none'
            style={[styles.preview, { borderColor: accent }]}
          >
            <Text
              variant='pageTitle'
              accent={accent}
              allowFontScaling={false}
              style={{ fontSize: 40, lineHeight: 48 }}
            >
              {preview}
            </Text>
          </View>
        )}
      </View>
      <Modal
        visible={pickerOpen}
        transparent
        animationType='fade'
        onRequestClose={onClose}
      >
        <View
          style={[
            styles.scrim,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessible={false}
          />
          <View
            style={[
              styles.sheet,
              {
                height: Math.min(
                  440,
                  screenHeight - insets.top - insets.bottom - 24,
                ),
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.sheetHeader}>
              <Text variant='section' accent={accent}>
                {t("library.alphabet.title")}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole='button'
                style={styles.close}
              >
                <Text>{t("common.close")}</Text>
              </Pressable>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.choices}
            >
              {letters.map((letter) => (
                <Pressable
                  key={letter}
                  disabled={!enabled(letter)}
                  accessibilityRole='button'
                  accessibilityLabel={t(
                    letter === "#"
                      ? "library.alphabet.symbols"
                      : "library.alphabet.jump",
                    { letter },
                  )}
                  accessibilityState={{
                    disabled: !enabled(letter),
                    selected: activeLetter === letter,
                  }}
                  onPress={() => select(letter)}
                  style={[
                    styles.choice,
                    {
                      borderColor:
                        activeLetter === letter ? accent : NeonBoard.line2,
                    },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    accent={enabled(letter) ? accent : NeonBoard.low}
                    style={{ fontSize: 20 }}
                  >
                    {letter}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {loading && (
              <ActivityIndicator
                color={accent}
                accessibilityLabel={t("common.loading")}
              />
            )}
            {failed && (
              <Pressable
                onPress={onRetry}
                accessibilityRole='button'
                style={styles.close}
              >
                <Text accent={accent}>{t("library.alphabet.retry")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", bottom: 8, width: 32 },
  rail: { flex: 1, paddingVertical: 0, backgroundColor: NeonBoard.stage },
  letter: { flex: 1, alignItems: "center", justifyContent: "center" },
  letterText: { ...FontFace.body, fontSize: 11, fontWeight: "700" },
  compact: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  preview: {
    position: "absolute",
    right: 44,
    top: "40%",
    width: 72,
    height: 72,
    backgroundColor: NeonBoard.card2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrim: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 24,
  },
  sheet: {
    maxHeight: "100%",
    backgroundColor: NeonBoard.card,
    borderColor: NeonBoard.line2,
    borderWidth: 1,
    padding: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  choice: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
