import { describe, expect, test } from "bun:test";
import {
  decideKidContent,
  hasKidFacts,
  type KidItemFacts,
  maxKidRatingLevel,
  normalizeKidRating,
  utcPremiereDate,
} from "./kidContentRules";

function movie(
  officialRating?: string,
  extras: Partial<KidItemFacts> = {},
): KidItemFacts {
  return {
    type: "Movie",
    officialRating,
    genres: ["Comedy"],
    lockedFields: [],
    ...extras,
  };
}

function series(
  officialRating?: string,
  extras: Partial<KidItemFacts> = {},
): KidItemFacts {
  return { type: "Series", officialRating, genres: ["Drama"], ...extras };
}

function episode(officialRating?: string, type = "Episode"): KidItemFacts {
  return { type, officialRating, genres: [], seriesId: "series" };
}

describe("TV kid content rules", () => {
  test("Poltergeist and Gremlins are hidden at every ceiling", () => {
    for (const item of [
      movie("PG", { productionYear: 1982, genres: ["Horror", "Thriller"] }),
      movie("PG", {
        productionYear: 1984,
        genres: ["Fantasy", "Horror", "Comedy"],
      }),
    ]) {
      expect(decideKidContent(item, 2)).toBe("horror");
      expect(decideKidContent(item, 4)).toBe("horror");
    }
  });

  test("The Pink Panther and Temple of Doom count as PG-13, and Moonstruck stays PG", () => {
    for (const premiereDate of [
      "1963-12-19T00:00:00.0000000Z",
      "1984-05-23T00:00:00.0000000Z",
    ]) {
      const item = movie("PG", { premiereDate });
      expect(decideKidContent(item, 2)).toBe("show");
      expect(decideKidContent(item, 1)).toBe("above-max");
    }
    expect(
      decideKidContent(
        movie("PG", { premiereDate: "1987-12-16T00:00:00Z" }),
        1,
      ),
    ).toBe("show");
  });

  test("unrated 12 Angry Men and UFC titles are hidden", () => {
    for (const item of [
      movie("NR", { productionYear: 1957, genres: ["Drama"] }),
      movie(undefined, { name: "UFC 300", genres: ["Sport"] }),
      movie("", { name: "UFC 300", type: "Video", genres: ["Sport"] }),
    ]) {
      expect(decideKidContent(item, 4)).toBe("no-us-rating");
    }
  });

  test("locked R and TV-MA ratings still apply, including to Ginny and Georgia's episodes and seasons", () => {
    const ginny = series("TV-MA", { lockedFields: ["OfficialRating"] });
    expect(decideKidContent(ginny, 2)).toBe("above-max");
    for (const item of [
      episode("TV-14"),
      episode(),
      episode("TV-G", "Season"),
    ]) {
      expect(decideKidContent(item, 2, ginny)).toBe("series-hidden");
    }
    expect(
      decideKidContent(movie("R", { lockedFields: ["OfficialRating"] }), 2),
    ).toBe("above-max");
  });

  test("Horror is a case-insensitive substring in the item or series genres, including locked titles", () => {
    for (const genre of ["Comedy Horror", "HORROR", "horror-comedy"]) {
      expect(
        decideKidContent(
          movie("G", { genres: [genre], lockedFields: ["OfficialRating"] }),
          4,
        ),
      ).toBe("horror");
      for (const item of [episode("TV-G"), episode(undefined, "Season")]) {
        expect(
          decideKidContent(item, 4, series("TV-PG", { genres: [genre] })),
        ).toBe("horror");
      }
    }
    expect(
      decideKidContent(
        { ...episode("TV-G"), genres: ["Horror"] },
        4,
        series("TV-G"),
      ),
    ).toBe("horror");
    expect(decideKidContent(movie("G", { genres: ["Horse riding"] }), 0)).toBe(
      "show",
    );
  });

  test("ratings are trimmed, uppercased and stripped of a US- prefix", () => {
    expect(normalizeKidRating("  pg-13 ")).toBe("PG-13");
    expect(normalizeKidRating("us-tv-y7-fv")).toBe("TV-Y7-FV");
    expect(normalizeKidRating("US-PG")).toBe("PG");
    for (const value of [undefined, "   ", "US-"])
      expect(normalizeKidRating(value)).toBeUndefined();
    expect(decideKidContent(movie(" us-pg-13 "), 2)).toBe("show");
  });

  test("only US movie and TV ratings are usable and compare on one scale", () => {
    for (const rating of [
      undefined,
      "",
      "NR",
      "Not Rated",
      "UNRATED",
      "Approved",
      "PASSED",
      "X",
      "GB-15",
      "16",
      "12",
      "NC16",
      "L",
      "TP",
      "0",
      "10",
      "U",
      "B",
      "6",
      "E",
      "MA15+",
      "Från 15 år",
      "A",
      "14",
      "ALL",
      "DE-12",
      "TV-Y7FV",
      "PG13",
    ]) {
      expect(decideKidContent(movie(rating), 4)).toBe("no-us-rating");
    }
    const levels = [
      ["G", "TV-Y", "TV-Y7", "TV-Y7-FV", "TV-G"],
      ["PG", "TV-PG"],
      ["PG-13", "TV-14"],
      ["R", "TV-MA"],
      ["NC-17"],
    ];
    for (const [level, ratings] of levels.entries()) {
      for (const rating of ratings) {
        for (let max = 0; max <= 4; max++) {
          const expected = level <= max ? "show" : "above-max";
          expect(
            decideKidContent(movie(rating, { productionYear: 2000 }), max),
          ).toBe(expected);
          expect(decideKidContent(series(rating), max)).toBe(expected);
        }
      }
    }
  });

  test("the series must pass and supplies the rating only when the episode or season has none", () => {
    expect(decideKidContent(episode(), 1, series("TV-PG"))).toBe("show");
    expect(decideKidContent(episode("", "Season"), 1, series("TV-Y7"))).toBe(
      "show",
    );
    expect(decideKidContent(episode(), 1, series("TV-14"))).toBe(
      "series-hidden",
    );
    expect(decideKidContent(episode("TV-G"), 4, series())).toBe(
      "series-hidden",
    );
    expect(decideKidContent(episode("TV-14"), 1, series("TV-PG"))).toBe(
      "above-max",
    );
    expect(decideKidContent(episode("16"), 4, series("TV-PG"))).toBe(
      "no-us-rating",
    );
    for (const item of [episode("TV-G"), episode("TV-G", "Season")]) {
      expect(decideKidContent(item, 4)).toBe("missing-facts");
    }
  });

  test("the pre-PG-13 rule is for unlocked PG movies and uses the UTC calendar date", () => {
    expect(
      decideKidContent(
        movie("PG", {
          productionYear: 1963,
          lockedFields: ["Name", "officialrating"],
        }),
        1,
      ),
    ).toBe("show");
    expect(
      decideKidContent(movie("NR", { lockedFields: ["OfficialRating"] }), 4),
    ).toBe("no-us-rating");
    expect(
      decideKidContent(
        movie("PG", { premiereDate: "1984-06-30T23:59:59Z" }),
        1,
      ),
    ).toBe("above-max");
    expect(
      decideKidContent(
        movie("PG", { premiereDate: "1984-07-01T00:00:00Z" }),
        1,
      ),
    ).toBe("show");
    expect(
      decideKidContent(
        movie("PG", { premiereDate: "1984-06-30T22:00:00-04:00" }),
        1,
      ),
    ).toBe("show");
    expect(utcPremiereDate("1984-06-30T22:00:00-04:00")).toBe("1984-07-01");
    expect(utcPremiereDate("1963-12-19T00:00:00")).toBe("1963-12-19");
    expect(utcPremiereDate("not a date")).toBeUndefined();
    expect(decideKidContent(movie("G", { productionYear: 1960 }), 0)).toBe(
      "show",
    );
    expect(decideKidContent(series("TV-PG", { productionYear: 1970 }), 1)).toBe(
      "show",
    );
    expect(
      decideKidContent(movie("PG", { type: "Video", productionYear: 1970 }), 1),
    ).toBe("show");
  });

  test("the production year is used when the premiere date is missing or unreadable", () => {
    expect(decideKidContent(movie("PG", { productionYear: 1984 }), 1)).toBe(
      "above-max",
    );
    expect(decideKidContent(movie("PG", { productionYear: 1985 }), 1)).toBe(
      "show",
    );
    expect(decideKidContent(movie("PG"), 1)).toBe("above-max");
    expect(decideKidContent(movie("PG"), 2)).toBe("show");
    expect(
      decideKidContent(
        movie("PG", { premiereDate: "garbage", productionYear: 1990 }),
        1,
      ),
    ).toBe("show");
  });

  test("genres and relevant locked fields distinguish partial metadata", () => {
    const oldPg = movie("PG", {
      productionYear: 1970,
      lockedFields: undefined,
    });
    expect(hasKidFacts(oldPg)).toBe(false);
    expect(decideKidContent(oldPg, 4)).toBe("missing-facts");
    expect(
      hasKidFacts(
        movie("PG", { productionYear: 1990, lockedFields: undefined }),
      ),
    ).toBe(true);
    expect(hasKidFacts(movie("R", { lockedFields: undefined }))).toBe(true);
    expect(hasKidFacts({ ...episode("TV-G"), genres: undefined })).toBe(false);
    const missingGenres = movie("G", { genres: undefined });
    expect(hasKidFacts(missingGenres)).toBe(false);
    expect(decideKidContent(missingGenres, 4)).toBe("missing-facts");
    expect(hasKidFacts({ type: "CollectionFolder" })).toBe(true);
  });

  test("TV's Jellyfin ceilings map to its single rating scale", () => {
    expect([10, 14, 17, 18, 21, 13, 12, 9, 0].map(maxKidRatingLevel)).toEqual([
      1, 2, 3, 4, 4, 2, 1, 0, 0,
    ]);
    expect(maxKidRatingLevel(NaN)).toBeUndefined();
    expect(decideKidContent(movie("NC-17"), maxKidRatingLevel(17))).toBe(
      "above-max",
    );
    expect(decideKidContent(movie("R"), maxKidRatingLevel(17))).toBe("show");
  });

  test("unknown ceilings and containers use TV's exemptions, including hiding Horror genres", () => {
    expect(decideKidContent(movie("G"), undefined)).toBe("unknown-ceiling");
    expect(decideKidContent(episode("TV-G"), undefined, series("TV-G"))).toBe(
      "unknown-ceiling",
    );
    for (const type of [
      "CollectionFolder",
      "UserView",
      "Folder",
      "AggregateFolder",
      "UserRootFolder",
      "Person",
      "Studio",
      "Year",
      "Playlist",
    ]) {
      expect(decideKidContent({ type, name: "Horror stuff" }, undefined)).toBe(
        "show",
      );
    }
    expect(decideKidContent({ type: "Genre", name: "Comedy" }, 0)).toBe("show");
    expect(decideKidContent({ type: "Genre", name: "Horror" }, 4)).toBe(
      "horror",
    );
    expect(
      decideKidContent({ type: "MusicGenre", name: "horrorcore" }, 4),
    ).toBe("horror");
  });

  test("trailers and unknown item kinds use the same title rules", () => {
    for (const type of ["SomethingNew", undefined, "Trailer"]) {
      expect(decideKidContent({ type, genres: [] }, 4)).toBe("no-us-rating");
    }
    expect(
      decideKidContent(
        movie("PG", { type: "Trailer", productionYear: 2000 }),
        1,
      ),
    ).toBe("show");
  });
});
