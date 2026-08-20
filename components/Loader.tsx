import {
  ActivityIndicator,
  type ActivityIndicatorProps,
  Platform,
} from "react-native";
import { Colors } from "@/constants/Colors";

interface Props extends ActivityIndicatorProps {}

export const Loader: React.FC<Props> = ({ ...props }) => {
  return (
    <ActivityIndicator
      size={"small"}
      color={Platform.OS === "ios" ? "white" : Colors.primary}
      {...props}
    />
  );
};
