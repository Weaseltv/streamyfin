import {
  Children,
  cloneElement,
  isValidElement,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { NeonBoard } from "@/constants/Colors";

interface Props extends ViewProps {
  title?: string | null | undefined;
  description?: ReactElement;
  /** Section accent for the head rule and the row glyphs. Defaults to volt. */
  accent?: string;
}

/**
 * A run of hairline rows on the stage under a section head. No card, no
 * radius: the rows carry a 1pt `line` bottom rule each.
 */
export const ListGroup: React.FC<PropsWithChildren<Props>> = ({
  title,
  children,
  description,
  accent = NeonBoard.volt,
  ...props
}) => {
  const childrenArray = Children.toArray(children);

  return (
    <View {...props}>
      {title ? <SectionHeader title={title} accent={accent} /> : null}
      <View className='flex flex-col'>
        {Children.map(childrenArray, (child) => {
          if (isValidElement<{ style?: ViewStyle; iconTint?: string }>(child)) {
            return cloneElement(child as any, {
              iconTint: child.props.iconTint ?? accent,
              style: StyleSheet.compose(child.props.style, styles.borderBottom),
            });
          }
          return child;
        })}
      </View>
      {description && <View className='px-3 mt-2'>{description}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: NeonBoard.line,
  },
});
