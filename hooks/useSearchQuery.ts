import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Debounce typing, but let the keyboard Search key submit immediately. */
export function useSearchQuery(
  text: string,
  { delay = 200, minimumLength = 1 } = {},
) {
  const [query, setQuery] = useState("");
  const updateQuery = useMemo(() => debounce(setQuery, delay), [delay]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < minimumLength) {
      setQuery("");
    } else {
      updateQuery(trimmed);
    }
    return () => updateQuery.cancel();
  }, [text, minimumLength, updateQuery]);

  const submit = useCallback(() => {
    updateQuery.cancel();
    // Explicit submission still supports one-letter titles such as "M".
    setQuery(text.trim());
  }, [text, updateQuery]);

  return { query, submit };
}
