import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeonBoard } from "@/constants/Colors";
import { glowOverline, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { usePageAccent } from "@/utils/atoms/pageAccent";
import { HeaderIcon, type HeaderIconName } from "./HeaderIcon";
import { Text } from "./Text";

interface Props {
  /** Show a back chevron before the brand (sub-pages that keep the brand row). */
  onBack?: () => void;
  /** Extra actions between the brand and the standard three. */
  right?: ReactNode;
  /** Hide the standard Downloads / Settings actions. */
  downloads?: boolean;
  settings?: boolean;
  /**
   * Show the Sessions action (what your other devices are playing, with
   * transport controls). Off by default; Home shows it.
   */
  sessions?: boolean;
  /** A 2pt accent loading line under the row (never a spinner over content). */
  loading?: boolean;
  /** Muted brand (used behind a sheet). */
  dim?: boolean;
}

/** The mascot beside the text wordmark: `WEASEL` in `text`, `PLEX` in volt. */
export const BrandLockup: React.FC<{ size?: number; dim?: boolean }> = ({
  size = 36,
  dim,
}) => (
  <View
    className='flex flex-row items-center'
    style={{ gap: 8, opacity: dim ? 0.4 : 1 }}
  >
    <Image
      source={require("@/assets/images/weaselplex-mascot-white.png")}
      style={{ width: size, height: size }}
      contentFit='contain'
    />
    <Text
      variant='section'
      allowFontScaling={false}
      style={{
        fontSize: size * 0.58,
        lineHeight: size * 0.67,
        letterSpacing: 0.5,
      }}
    >
      WEASEL
      <Text
        variant='section'
        allowFontScaling={false}
        accent={NeonBoard.volt}
        style={{
          fontSize: size * 0.58,
          lineHeight: size * 0.67,
          letterSpacing: 0.5,
        }}
      >
        PLEX
      </Text>
    </Text>
  </View>
);

/** A 44 square icon button with a white glyph, for the brand row. */
export const HeaderIconButton: React.FC<{
  name: HeaderIconName;
  onPress: () => void;
  tintColor?: string;
  accessibilityLabel?: string;
}> = ({ name, onPress, tintColor = NeonBoard.text, accessibilityLabel }) => {
  const haptic = useHaptic("light");
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress();
      }}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={{
        width: Sizes.iconButton,
        height: Sizes.iconButton,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <HeaderIcon name={name} tintColor={tintColor} size={Sizes.headerGlyph} />
    </Pressable>
  );
};

/**
 * The brand row that heads every tab root: 56 high under the status inset,
 * 1pt `line` bottom rule, mascot + wordmark on the left, Sessions /
 * Downloads / Settings as 44 square icon buttons on the right.
 */
/**
 * Sessions action: the remote control for your other devices, with the cast
 * glyph. White like the other header icons (owner, 2026-10-16).
 */
const SessionsHeaderButton: React.FC = () => {
  const router = useRouter();
  return (
    <HeaderIconButton
      name='sessions'
      accessibilityLabel='Sessions'
      onPress={() => router.push("/(auth)/(tabs)/(home)/sessions")}
    />
  );
};

export const NeonHeader: React.FC<Props> = ({
  onBack,
  right,
  downloads = true,
  settings = true,
  sessions = false,
  loading = false,
  dim = false,
}) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const accent = usePageAccent();

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: NeonBoard.stage,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      <View
        style={{
          height: Sizes.brandRow,
          paddingLeft: onBack ? 4 : Sizes.gutter,
          paddingRight: 6,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View className='flex flex-row items-center' style={{ gap: 4 }}>
          {onBack ? (
            <HeaderIconButton
              name='back'
              onPress={onBack}
              tintColor={NeonBoard.text}
              accessibilityLabel='Back'
            />
          ) : null}
          <BrandLockup dim={dim} />
        </View>
        <View
          className='flex flex-row items-center'
          style={{ opacity: dim ? 0.4 : 1 }}
        >
          {right}
          {sessions ? <SessionsHeaderButton /> : null}
          {downloads ? (
            <HeaderIconButton
              name='downloads'
              accessibilityLabel='Downloads'
              onPress={() => router.push("/(auth)/(tabs)/(home)/downloads")}
            />
          ) : null}
          {settings ? (
            <HeaderIconButton
              name='settings'
              accessibilityLabel='Settings'
              onPress={() => router.push("/(auth)/settings")}
            />
          ) : null}
        </View>
      </View>
      {loading ? (
        <View
          style={[
            { height: 2, backgroundColor: accent, marginBottom: -2 },
            glowOverline(accent),
          ]}
        />
      ) : null}
    </View>
  );
};

/** Back glyph as a Feather stroke for places without HeaderIcon. */
export const BackGlyph = () => (
  <Feather
    name='chevron-left'
    size={Sizes.headerGlyph}
    color={NeonBoard.text}
  />
);
