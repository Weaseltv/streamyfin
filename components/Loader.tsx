import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { NeonBoard } from "@/constants/Colors";

interface Props extends ActivityIndicatorProps {}

/**
 * The inline activity indicator. Neon Board never spins over content: pages
 * use the 2pt accent loading line under the brand row (`NeonHeader loading`)
 * or a `LoadingLine`; this stays for buttons and small inline waits.
 */
export const Loader: React.FC<Props> = ({ ...props }) => {
  return <ActivityIndicator size={"small"} color={NeonBoard.volt} {...props} />;
};
