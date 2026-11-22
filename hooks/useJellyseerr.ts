import axios, { type AxiosError, type AxiosInstance } from "axios";
import { atom, useAtomValue } from "jotai";
import { useAtom } from "jotai/index";
import inRange from "lodash/inRange";
import type { User as JellyseerrUser } from "@/utils/jellyseerr/server/entity/User";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { seerr403ClearsSession } from "@/utils/jellyseerrSession";
import { storage } from "@/utils/mmkv";
import { store } from "@/utils/store";
import "@/augmentations";
import { t } from "i18next";
import { useCallback, useMemo } from "react";
import { toast } from "sonner-native";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { requestAccessAtom } from "@/utils/atoms/requestStatus";
import { useSettings } from "@/utils/atoms/settings";
import {
  customHeadersVersionAtom,
  getIntegrationHeaders,
} from "@/utils/customHeaders";
import type { RTRating } from "@/utils/jellyseerr/server/api/rating/rottentomatoes";
import {
  IssueStatus,
  type IssueType,
} from "@/utils/jellyseerr/server/constants/issue";
import {
  MediaRequestStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";
import type Issue from "@/utils/jellyseerr/server/entity/Issue";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type { GenreSliderItem } from "@/utils/jellyseerr/server/interfaces/api/discoverInterfaces";
import type {
  MediaRequestBody,
  RequestResultsResponse,
} from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import type {
  ServiceCommonServer,
  ServiceCommonServerWithDetails,
} from "@/utils/jellyseerr/server/interfaces/api/serviceInterfaces";
import type { UserResultsResponse } from "@/utils/jellyseerr/server/interfaces/api/userInterfaces";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type {
  CombinedCredit,
  PersonCreditCast,
  PersonDetails,
} from "@/utils/jellyseerr/server/models/Person";
import type {
  SeasonWithEpisodes,
  TvDetails,
} from "@/utils/jellyseerr/server/models/Tv";
import { writeErrorLog } from "@/utils/log";
import {
  fetchRequestSearchPage,
  type RequestSearchParams as SearchParams,
  type RequestSearchResults as SearchResults,
} from "@/utils/requestSearch";
import { isVersionBelow } from "@/utils/serverUrl/semver";

const JELLYSEERR_USER = "JELLYSEERR_USER";
const JELLYSEERR_COOKIES = "JELLYSEERR_COOKIES";

export const clearJellyseerrStorageData = () => {
  storage.remove(JELLYSEERR_USER);
  storage.remove(JELLYSEERR_COOKIES);
  // Keep the in-memory user in sync with storage. Without this the atom held a
  // stale user after a cleared session, so the silent reconnect skipped (it
  // only runs when there is no user) and the Requests tab stayed gone until a
  // full app restart. Resetting it lets useWeaselSeerrAutoConnect re-provision.
  store.set(jellyseerrUserAtom, undefined);
};

export enum Endpoints {
  STATUS = "/status",
  API_V1 = "/api/v1",
  SEARCH = "/search",
  REQUEST = "/request",
  PERSON = "/person",
  COMBINED_CREDITS = "/combined_credits",
  MOVIE = "/movie",
  RATINGS = "/ratings",
  ISSUE = "/issue",
  USER = "/user",
  SERVICE = "/service",
  TV = "/tv",
  SETTINGS = "/settings",
  NETWORK = "/network",
  STUDIO = "/studio",
  GENRE_SLIDER = "/genreslider",
  DISCOVER = "/discover",
  DISCOVER_TRENDING = `${DISCOVER}/trending`,
  DISCOVER_MOVIES = `${DISCOVER}/movies`,
  DISCOVER_TV = DISCOVER + TV,
  DISCOVER_TV_NETWORK = DISCOVER + TV + NETWORK,
  DISCOVER_MOVIES_STUDIO = `${DISCOVER}${MOVIE}s${STUDIO}`,
  AUTH_JELLYFIN = "/auth/jellyfin",
}

export type DiscoverEndpoint =
  | Endpoints.DISCOVER_TV_NETWORK
  | Endpoints.DISCOVER_TRENDING
  | Endpoints.DISCOVER_MOVIES
  | Endpoints.DISCOVER_TV;

export type TestResult =
  | {
      isValid: true;
      requiresPass: boolean;
    }
  | {
      isValid: false;
    };

/**
 * Options for a client used by one request-server sign-in or one request scope (phones, plan 5.3
 * rule 1): `signal` aborts every call it makes; while `isCurrent()` is false it writes and clears
 * no stored session data, so a late answer from an older exchange can't overwrite a newer one.
 */
export interface JellyseerrApiOptions {
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}

export class JellyseerrApi {
  axios: AxiosInstance;
  /** Proxy auth headers for a Jellyseerr behind an access gateway. */
  private customHeaders: Record<string, string>;
  private isCurrent: () => boolean;

  constructor(
    baseUrl: string,
    customHeaders?: Record<string, string>,
    options?: JellyseerrApiOptions,
  ) {
    this.axios = axios.create({
      baseURL: baseUrl,
      withCredentials: true,
      withXSRFToken: true,
      xsrfHeaderName: "XSRF-TOKEN",
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    this.customHeaders = customHeaders ?? {};
    this.isCurrent = options?.isCurrent ?? (() => true);

    this.setInterceptors();
  }

  async test(): Promise<TestResult> {
    const user = storage.get<JellyseerrUser>(JELLYSEERR_USER);
    const cookies = storage.get<string[]>(JELLYSEERR_COOKIES);

    if (user && cookies) {
      return Promise.resolve({
        isValid: true,
        requiresPass: false,
      });
    }

    return await this.axios
      .get(Endpoints.API_V1 + Endpoints.STATUS)
      .then((response) => {
        const { status, headers, data } = response;
        if (inRange(status, 200, 299)) {
          if (data.version && isVersionBelow(data.version, "2.0.0")) {
            const error = t(
              "jellyseerr.toasts.jellyseerr_does_not_meet_requirements",
            );
            writeErrorLog(
              `Jellyseerr version ${data.version} is below the required 2.0.0`,
            );
            toast.error(error);
            throw Error(error);
          }

          if (this.isCurrent()) {
            storage.setAny(
              JELLYSEERR_COOKIES,
              headers["set-cookie"]?.flatMap((c) => c.split("; ")) ?? [],
            );
          }
          return {
            isValid: true,
            requiresPass: true,
          };
        }
        toast.error(t("jellyseerr.toasts.jellyseerr_test_failed"));
        writeErrorLog(
          `Jellyseerr returned a ${status} for url:\n${response.config.url}`,
          response.data,
        );
        return {
          isValid: false,
          requiresPass: false,
        };
      })
      .catch((e) => {
        const msg = t("jellyseerr.toasts.failed_to_test_jellyseerr_server_url");
        toast.error(msg);
        console.error(msg, e);
        return {
          isValid: false,
          requiresPass: false,
        };
      });
  }

  /**
   * Password sign-in. Phones pass `store: false` and save the user themselves once the exchange
   * is still current (plan 5.3 rule 1); the TV builds keep storing here.
   */
  async login(
    username: string,
    password: string,
    { store = true }: { store?: boolean } = {},
  ): Promise<JellyseerrUser> {
    return this.axios
      ?.post<JellyseerrUser>(Endpoints.API_V1 + Endpoints.AUTH_JELLYFIN, {
        username,
        password,
        email: username,
      })
      .then((response) => {
        const user = response?.data;
        if (!user) throw Error("Login failed");
        if (store && this.isCurrent()) storage.setAny(JELLYSEERR_USER, user);
        return user;
      });
  }

  /**
   * WeaselPlex: hit /status and capture its cookies, exactly as test() does,
   * but with no toasts — this runs silently during auto-provisioning, and a
   * request server being down must never surface an error a customer has to
   * dismiss. The stored cookies feed the XSRF interceptor and the configured
   * gate in useJellyseerr, the same two things test() feeds for a manual login.
   */
  async primeSession(): Promise<void> {
    const { status, headers } = await this.axios.get(
      Endpoints.API_V1 + Endpoints.STATUS,
    );
    if (!inRange(status, 200, 299)) {
      throw new Error(`Request server returned ${status}`);
    }
    if (!this.isCurrent()) return;
    storage.setAny(
      JELLYSEERR_COOKIES,
      headers["set-cookie"]?.flatMap((c) => c.split("; ")) ?? [],
    );
  }

  /**
   * WeaselPlex: Seerr's Quick Connect login endpoints. These exist in stock
   * Seerr (server/routes/auth.ts) but are absent from its published OpenAPI
   * spec, so they are called directly — deliberately on the SAME axios
   * instance as everything else, so the session Seerr issues on success lands
   * exactly as a password login's would. Mirrors the Android app's
   * SeerrApiClient (Wholphin c04399f5).
   */
  async quickConnectInitiate(): Promise<{ code: string; secret: string }> {
    const response = await this.axios.post(
      `${Endpoints.API_V1 + Endpoints.AUTH_JELLYFIN}/quickconnect/initiate`,
    );
    const code: string | undefined = response?.data?.code;
    const secret: string | undefined = response?.data?.secret;
    if (!code || !secret) {
      throw new Error(
        "Media server returned an incomplete Quick Connect response.",
      );
    }
    return { code, secret };
  }

  /**
   * Exchanges an approved secret for a real per-user Seerr session, then
   * stores the signed-in user the same way login() does. Request history and
   * quotas behave exactly as with a password login.
   */
  async quickConnectAuthenticate(
    secret: string,
    { store = true }: { store?: boolean } = {},
  ): Promise<JellyseerrUser> {
    await this.axios.post(
      `${Endpoints.API_V1 + Endpoints.AUTH_JELLYFIN}/quickconnect/authenticate`,
      { secret },
    );
    const { data: user } = await this.axios.get<JellyseerrUser>(
      `${Endpoints.API_V1}/auth/me`,
    );
    if (!user?.id) throw new Error("Quick Connect sign-in was rejected.");
    if (store && this.isCurrent()) storage.setAny(JELLYSEERR_USER, user);
    return user;
  }

  /**
   * Cancel a request still waiting for approval (`DELETE /api/v1/request/{id}`). Returns the HTTP
   * status, or null when there was no answer.
   */
  async deleteRequestStatus(id: number): Promise<number | null> {
    try {
      const res = await this.axios.delete(
        `${Endpoints.API_V1 + Endpoints.REQUEST}/${id}`,
      );
      return res.status;
    } catch (error) {
      return axios.isAxiosError(error)
        ? (error.response?.status ?? null)
        : null;
    }
  }

  /** The status of `GET /api/v1/request/{id}` (after the progress service said "gone"). */
  async requestReadStatus(id: number): Promise<number | null> {
    try {
      const res = await this.axios.get(
        `${Endpoints.API_V1 + Endpoints.REQUEST}/${id}`,
      );
      return res.status;
    } catch (error) {
      return axios.isAxiosError(error)
        ? (error.response?.status ?? null)
        : null;
    }
  }

  /** Who this session belongs to (`GET /api/v1/auth/me`). */
  async authMe(): Promise<JellyseerrUser> {
    const { data } = await this.axios.get<JellyseerrUser>(
      `${Endpoints.API_V1}/auth/me`,
    );
    return data;
  }

  /** One page of a member's own requests, newest first (the TV's request list read). */
  async ownRequests(params: {
    take: number;
    skip: number;
    requestedBy: number;
  }): Promise<RequestResultsResponse> {
    return this.axios
      .get<RequestResultsResponse>(Endpoints.API_V1 + Endpoints.REQUEST, {
        params: { ...params, filter: "all", sort: "added" },
      })
      .then(({ data }) => data);
  }

  async discoverSettings(): Promise<DiscoverSlider[]> {
    return this.axios
      ?.get<DiscoverSlider[]>(
        Endpoints.API_V1 + Endpoints.SETTINGS + Endpoints.DISCOVER,
      )
      .then(({ data }) => data);
  }

  async discover(
    endpoint: DiscoverEndpoint | string,
    params: any,
  ): Promise<SearchResults> {
    return this.axios
      ?.get<SearchResults>(Endpoints.API_V1 + endpoint, { params })
      .then(({ data }) => data);
  }

  async getGenreSliders(
    endpoint: Endpoints.TV | Endpoints.MOVIE,
    params: any = undefined,
  ): Promise<GenreSliderItem[]> {
    return this.axios
      ?.get<GenreSliderItem[]>(
        Endpoints.API_V1 +
          Endpoints.DISCOVER +
          Endpoints.GENRE_SLIDER +
          endpoint,
        { params },
      )
      .then(({ data }) => data);
  }

  async search(
    params: SearchParams,
    signal?: AbortSignal,
  ): Promise<SearchResults> {
    return fetchRequestSearchPage(this.axios, params, signal);
  }

  async request(request: MediaRequestBody): Promise<MediaRequest> {
    return this.axios
      ?.post<MediaRequest>(Endpoints.API_V1 + Endpoints.REQUEST, request)
      .then(({ data }) => data);
  }

  async getRequest(id: number): Promise<MediaRequest> {
    return this.axios
      ?.get<MediaRequest>(`${Endpoints.API_V1 + Endpoints.REQUEST}/${id}`)
      .then(({ data }) => data);
  }

  async approveRequest(requestId: number): Promise<MediaRequest> {
    return this.axios
      ?.post<MediaRequest>(
        `${Endpoints.API_V1 + Endpoints.REQUEST}/${requestId}/approve`,
      )
      .then(({ data }) => data);
  }

  async declineRequest(requestId: number): Promise<MediaRequest> {
    return this.axios
      ?.post<MediaRequest>(
        `${Endpoints.API_V1 + Endpoints.REQUEST}/${requestId}/decline`,
      )
      .then(({ data }) => data);
  }

  async requests(
    params = {
      filter: "all",
      take: 10,
      sort: "modified",
      skip: 0,
    },
  ): Promise<RequestResultsResponse> {
    return this.axios
      ?.get<RequestResultsResponse>(Endpoints.API_V1 + Endpoints.REQUEST, {
        params,
      })
      .then(({ data }) => data);
  }

  async movieDetails(id: number) {
    return this.axios
      ?.get<MovieDetails>(`${Endpoints.API_V1 + Endpoints.MOVIE}/${id}`)
      .then((response) => {
        return response?.data;
      });
  }

  async personDetails(
    id: number | string,
    signal?: AbortSignal,
  ): Promise<PersonDetails> {
    return this.axios
      ?.get<PersonDetails>(`${Endpoints.API_V1 + Endpoints.PERSON}/${id}`, {
        signal,
      })
      .then((response) => {
        return response?.data;
      });
  }

  async personCombinedCredits(
    id: number | string,
    signal?: AbortSignal,
  ): Promise<CombinedCredit> {
    return this.axios
      ?.get<CombinedCredit>(
        `${
          Endpoints.API_V1 + Endpoints.PERSON
        }/${id}${Endpoints.COMBINED_CREDITS}`,
        { signal },
      )
      .then((response) => {
        return response?.data;
      });
  }

  async movieRatings(id: number) {
    return this.axios
      ?.get<RTRating>(
        `${Endpoints.API_V1}${Endpoints.MOVIE}/${id}${Endpoints.RATINGS}`,
      )
      .then(({ data }) => data);
  }

  async tvDetails(id: number) {
    return this.axios
      ?.get<TvDetails>(`${Endpoints.API_V1}${Endpoints.TV}/${id}`)
      .then((response) => {
        return response?.data;
      });
  }

  async tvRatings(id: number) {
    return this.axios
      ?.get<RTRating>(
        `${Endpoints.API_V1}${Endpoints.TV}/${id}${Endpoints.RATINGS}`,
      )
      .then(({ data }) => data);
  }

  async tvSeason(id: number, seasonId: number) {
    return this.axios
      ?.get<SeasonWithEpisodes>(
        `${Endpoints.API_V1}${Endpoints.TV}/${id}/season/${seasonId}`,
      )
      .then((response) => {
        return response?.data;
      });
  }

  async user(params: any) {
    return this.axios
      ?.get<UserResultsResponse>(`${Endpoints.API_V1}${Endpoints.USER}`, {
        params,
      })
      .then(({ data }) => data.results);
  }

  imageProxy(path?: string, filter = "original", width = 1920, quality = 75) {
    return path
      ? `${this.axios.defaults.baseURL}/_next/image?${new URLSearchParams(
          `url=https://image.tmdb.org/t/p/${filter}/${path}&w=${width}&q=${quality}`,
        ).toString()}`
      : `${this.axios?.defaults.baseURL}/images/overseerr_poster_not_found_logo_top.png`;
  }

  async submitIssue(mediaId: number, issueType: IssueType, message: string) {
    return this.axios
      ?.post<Issue>(Endpoints.API_V1 + Endpoints.ISSUE, {
        mediaId,
        issueType,
        message,
      })
      .then((response) => {
        const issue = response.data;

        if (issue.status === IssueStatus.OPEN) {
          toast.success(t("jellyseerr.toasts.issue_submitted"));
        }
        return issue;
      });
  }

  async service(type: "radarr" | "sonarr") {
    return this.axios
      ?.get<ServiceCommonServer[]>(
        `${Endpoints.API_V1 + Endpoints.SERVICE}/${type}`,
      )
      .then(({ data }) => data);
  }

  async serviceDetails(type: "radarr" | "sonarr", id: number) {
    return this.axios
      ?.get<ServiceCommonServerWithDetails>(
        `${Endpoints.API_V1 + Endpoints.SERVICE}/${type}/${id}`,
      )
      .then(({ data }) => data);
  }

  private setInterceptors() {
    this.axios.interceptors.response.use(
      async (response) => {
        const cookies = response.headers["set-cookie"];
        if (cookies && this.isCurrent()) {
          storage.setAny(
            JELLYSEERR_COOKIES,
            response.headers["set-cookie"]?.flatMap((c) => c.split("; ")),
          );
        }
        return response;
      },
      (error: AxiosError) => {
        if (axios.isCancel(error)) return Promise.reject(error);
        writeErrorLog(
          `Jellyseerr response error\nerror: ${error.toString()}\nurl: ${error?.config?.url}`,
          error.response?.data,
        );
        // Only an auth-endpoint 403 means the session itself is dead and must be
        // torn down (so the silent connect re-establishes it). A 403 from any
        // other endpoint is a per-request permission result; clearing the whole
        // session there logged the customer out of Seerr and hid the Requests
        // tab after a single forbidden call. See utils/jellyseerrSession.
        if (
          error.response?.status === 403 &&
          seerr403ClearsSession(error?.config?.url) &&
          this.isCurrent()
        ) {
          clearJellyseerrStorageData();
        }
        return Promise.reject(error);
      },
    );

    this.axios.interceptors.request.use(
      async (config) => {
        // set() rather than index assignment so axios normalizes the name and
        // a differently-cased duplicate cannot be emitted twice.
        for (const [key, value] of Object.entries(this.customHeaders)) {
          config.headers.set(key, value);
        }

        const cookies = storage.get<string[]>(JELLYSEERR_COOKIES);
        if (cookies) {
          const headerName = this.axios.defaults.xsrfHeaderName!;
          const xsrfToken = cookies
            .find((c) => c.includes(headerName))
            ?.split(`${headerName}=`)?.[1];
          if (xsrfToken) {
            config.headers[headerName] = xsrfToken;
          }
        }
        return config;
      },
      (error) => {
        console.error("Jellyseerr request error", error);
      },
    );
  }
}

// Exported for WeaselPlex's silent Seerr provisioning (useWeaselSeerrAutoConnect),
// which must publish the auto-connected user to every consumer of this hook.
export const jellyseerrUserAtom = atom(
  storage.get<JellyseerrUser>(JELLYSEERR_USER),
);

/**
 * Save a signed-in request-server user and publish it. Phones call this only once their sign-in
 * exchange is still the current one (plan 5.3 rule 1).
 */
export const storeJellyseerrUser = (user: JellyseerrUser) => {
  storage.setAny(JELLYSEERR_USER, user);
  store.set(jellyseerrUserAtom, user);
};

export const useJellyseerr = () => {
  const { settings, updateSettings } = useSettings();
  const [jellyseerrUser, setJellyseerrUser] = useAtom(jellyseerrUserAtom);
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);
  const queryClient = useNetworkAwareQueryClient();

  // Phones: no request client until this session's policy is confirmed as an
  // adult's (plan 5.3 rule 8). Without a client, request title pages, ratings
  // and request buttons are not offered. The TV builds are unchanged.
  const requestAccess = useAtomValue(requestAccessAtom);

  const jellyseerrApi = useMemo(() => {
    if (!requestAccess) return undefined;
    const cookies = storage.get<string[]>(JELLYSEERR_COOKIES);
    if (settings?.jellyseerrServerUrl && cookies && jellyseerrUser) {
      return new JellyseerrApi(
        settings.jellyseerrServerUrl,
        getIntegrationHeaders("jellyseerr"),
      );
    }
    return undefined;
    // customHeadersVersion: rebuild the client when the headers change.
  }, [
    settings?.jellyseerrServerUrl,
    jellyseerrUser,
    customHeadersVersion,
    requestAccess,
  ]);

  const clearAllJellyseerData = useCallback(async () => {
    clearJellyseerrStorageData();
    setJellyseerrUser(undefined);
    updateSettings({ jellyseerrServerUrl: undefined });
  }, []);

  const requestMedia = useCallback(
    (title: string, request: MediaRequestBody, onSuccess?: () => void) => {
      jellyseerrApi?.request?.(request)?.then(async (mediaRequest) => {
        await queryClient.invalidateQueries({
          queryKey: ["search", "jellyseerr"],
        });

        switch (mediaRequest.status) {
          case MediaRequestStatus.PENDING:
          case MediaRequestStatus.APPROVED:
            toast.success(
              t("jellyseerr.toasts.requested_item", { item: title }),
            );
            onSuccess?.();
            break;
          case MediaRequestStatus.DECLINED:
            toast.error(
              t("jellyseerr.toasts.you_dont_have_permission_to_request"),
            );
            break;
          case MediaRequestStatus.FAILED:
            toast.error(
              t("jellyseerr.toasts.something_went_wrong_requesting_media"),
            );
            break;
        }
      });
    },
    [jellyseerrApi],
  );

  const isJellyseerrMovieOrTvResult = (
    items: any | null | undefined,
  ): items is MovieResult | TvResult => {
    return (
      items &&
      Object.hasOwn(items, "mediaType") &&
      (items.mediaType === MediaType.MOVIE || items.mediaType === MediaType.TV)
    );
  };

  const getTitle = (
    item?: TvResult | TvDetails | MovieResult | MovieDetails | PersonCreditCast,
  ) => {
    return isJellyseerrMovieOrTvResult(item)
      ? item.mediaType === MediaType.MOVIE
        ? item?.title
        : item?.name
      : item?.mediaInfo?.mediaType === MediaType.MOVIE
        ? (item as MovieDetails)?.title
        : (item as TvDetails)?.name;
  };

  const getYear = (
    item?: TvResult | TvDetails | MovieResult | MovieDetails | PersonCreditCast,
  ): number | undefined => {
    const year = new Date(
      (isJellyseerrMovieOrTvResult(item)
        ? item.mediaType === MediaType.MOVIE
          ? item?.releaseDate
          : item?.firstAirDate
        : item?.mediaInfo?.mediaType === MediaType.MOVIE
          ? (item as MovieDetails)?.releaseDate
          : (item as TvDetails)?.firstAirDate) || "",
    ).getFullYear();
    // No release date yet (or an unreadable one): no year, rather than NaN,
    // which the title page used to show as "NaN".
    return Number.isNaN(year) ? undefined : year;
  };

  const getMediaType = (
    item?: TvResult | TvDetails | MovieResult | MovieDetails | PersonCreditCast,
  ): MediaType => {
    return isJellyseerrMovieOrTvResult(item)
      ? (item.mediaType as MediaType)
      : item?.mediaInfo?.mediaType;
  };

  const jellyseerrRegion = useMemo(
    // streamingRegion and discoverRegion exists. region doesn't
    () => jellyseerrUser?.settings?.discoverRegion || "US",
    [jellyseerrUser],
  );

  const jellyseerrLocale = useMemo(() => {
    return jellyseerrUser?.settings?.locale || "en";
  }, [jellyseerrUser]);

  return {
    jellyseerrApi,
    jellyseerrUser,
    setJellyseerrUser,
    clearAllJellyseerData,
    isJellyseerrMovieOrTvResult,
    getTitle,
    getYear,
    getMediaType,
    jellyseerrRegion,
    jellyseerrLocale,
    requestMedia,
  };
};
