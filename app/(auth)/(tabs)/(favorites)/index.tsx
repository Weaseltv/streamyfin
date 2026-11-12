import { Platform } from "react-native";
import { Favorites as TVFavorites } from "@/components/home/Favorites.tv";
import { WatchlistGrid } from "@/components/home/WatchlistGrid";

/** The Watchlist tab: one grid with ALL / MOVIES / SHOWS and RANDOM, as on the TV. */
export default function FavoritesPage() {
  if (Platform.isTV) {
    return <TVFavorites />;
  }
  return <WatchlistGrid />;
}
