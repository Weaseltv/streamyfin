import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { Chip } from "@/components/common/Chip";
import { NeonBoard } from "@/constants/Colors";

type SearchType = "Library" | "Discover";

interface SearchTabButtonsProps {
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  t: (key: string) => string;
}

/** Library · Requests chips; the selected one is filled volt. */
export const SearchTabButtons: React.FC<SearchTabButtonsProps> = ({
  searchType,
  setSearchType,
  t,
}) => {
  const requestsSelected = searchType === "Discover";
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Chip
        label={t("search.library")}
        selected={searchType === "Library"}
        onPress={() => setSearchType("Library")}
      />
      <Chip
        label={t("search.discover")}
        selected={requestsSelected}
        icon={
          <Feather
            name='inbox'
            size={17}
            color={requestsSelected ? NeonBoard.onAccent : NeonBoard.text}
          />
        }
        onPress={() => setSearchType("Discover")}
      />
    </View>
  );
};
