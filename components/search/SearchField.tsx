import { Feather } from "@expo/vector-icons";
import { forwardRef } from "react";
import {
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { FontFace, MAX_FONT_SCALE, Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";

interface Props extends Omit<TextInputProps, "value" | "onChangeText"> {
  value: string;
  onChangeText: (text: string) => void;
  /** Clears the query; falls back to `onChangeText("")`. */
  onClear?: () => void;
  accent?: string;
}

export const SEARCH_FIELD_HEIGHT = 52;

/**
 * The 52 search strip under the page head: a 22 accent `search` glyph, the
 * query in Barlow 18/600 with an accent caret and selection, and a clear
 * glyph on the right. Sits on the stage with a 1pt `line` rule below.
 */
export const SearchField = forwardRef<TextInput, Props>(
  ({ value, onChangeText, onClear, accent: accentProp, ...rest }, ref) => {
    const accent = useAccent(accentProp);
    return (
      <View
        style={{
          height: SEARCH_FIELD_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: Sizes.gutter,
          gap: 12,
          backgroundColor: NeonBoard.stage,
          borderBottomWidth: 1,
          borderBottomColor: NeonBoard.line,
        }}
      >
        <Feather name='search' size={22} color={accent} />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          allowFontScaling
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          placeholderTextColor={NeonBoard.low}
          selectionColor={accent}
          cursorColor={accent}
          autoCorrect={false}
          autoCapitalize='none'
          returnKeyType='search'
          clearButtonMode='never'
          style={{
            flex: 1,
            height: SEARCH_FIELD_HEIGHT,
            paddingVertical: 0,
            color: NeonBoard.text,
            ...FontFace.bodySemi,
            fontSize: 18,
          }}
          {...rest}
        />
        {value.length > 0 ? (
          <TouchableOpacity
            onPress={() => (onClear ? onClear() : onChangeText(""))}
            hitSlop={8}
            accessibilityRole='button'
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name='x' size={22} color={NeonBoard.mid} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  },
);

SearchField.displayName = "SearchField";
