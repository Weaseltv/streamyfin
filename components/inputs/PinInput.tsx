import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import React, { useCallback, useImperativeHandle, useRef } from "react";
import {
  type StyleProp,
  StyleSheet,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { glowChip } from "@/constants/neon";

interface PinInputProps
  extends Omit<TextInputProps, "value" | "onChangeText" | "style"> {
  value: string;
  onChangeText: (text: string) => void;
  length?: number;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export interface PinInputRef {
  focus: () => void;
}

/**
 * Neon Board PIN cells: 46×60 `card2` boxes with a 1pt `line2` border,
 * radius 0. Filled and active cells take a volt border with a chip glow;
 * digits are Condensed 800 30. The real input stays hidden underneath.
 */
const PinInputComponent = React.forwardRef<PinInputRef, PinInputProps>(
  (props, ref) => {
    const {
      value,
      onChangeText,
      length = 6,
      style,
      autoFocus,
      ...rest
    } = props;

    const inputRef = useRef<any>(null);
    const activeIndex = value.length;

    const handlePress = useCallback(() => {
      inputRef.current?.focus();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
      }),
      [],
    );

    return (
      <View style={[styles.container, style]}>
        <BottomSheetTextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          keyboardType='number-pad'
          maxLength={length}
          style={styles.hiddenInput}
          autoFocus={autoFocus}
          {...rest}
        />
        <View style={styles.cells} onTouchStart={handlePress}>
          {Array(length)
            .fill(0)
            .map((_, i) => {
              const lit = i < activeIndex || i === activeIndex;
              return (
                <View
                  key={i}
                  style={[
                    styles.cell,
                    lit && styles.litCell,
                    lit && glowChip(NeonBoard.volt),
                  ]}
                >
                  <Text variant='display' allowFontScaling={false}>
                    {value[i]}
                  </Text>
                  {i === activeIndex && <View style={styles.cursor} />}
                </View>
              );
            })}
        </View>
      </View>
    );
  },
);

PinInputComponent.displayName = "PinInput";

export const PinInput = PinInputComponent;

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  cells: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
    gap: 12,
  },
  cell: {
    width: 46,
    height: 60,
    borderWidth: 1,
    borderColor: NeonBoard.line2,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NeonBoard.card2,
  },
  litCell: {
    borderColor: NeonBoard.volt,
  },
  cursor: {
    position: "absolute",
    width: 2,
    height: 26,
    backgroundColor: NeonBoard.volt,
  },
});
