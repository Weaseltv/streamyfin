/**
 * The "Add kid profile" flow after the grown-up is verified (contract 5.4, 12.3): create a new kid,
 * sign in one of the account's own kids, or pair another account's kid with a code, then hand the
 * kid's sign-in to the caller. Port of the TV's `ui/kids/AddKidViewModel.kt` from its `ChooseHow`
 * step on. The steps before it (who is adding, the grown-up's PIN, every other grown-up's PIN) are
 * the caller's, which supplies a verified grown-up's token.
 *
 * A created kid is never created again: retries and expired codes reconnect the same kid. A kid's
 * sign-in the flow won't use is signed out; one handed to the caller never is. Pure (everything is
 * injected), so it runs under `bun test`.
 */
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { validKidNameOrNull } from "./kidNames";
import {
  type KidApiResult,
  type KidLevel,
  KidProblemCodes,
  type KidProfile,
  type KidProfilesClient,
} from "./kidProfilesApi";

export interface KidSignIn {
  accessToken: string;
  user: UserDto;
}

export type QuickConnectPoll = "waiting" | "authenticated" | "expired";

export interface KidQuickConnect {
  initiate(): Promise<{ code: string; secret: string }>;
  isAuthenticated(secret: string): Promise<boolean>;
  /** 404 (expired or used) is `expired`; anything else that fails throws. */
  poll(secret: string): Promise<QuickConnectPoll>;
  /** Bounded by its own HTTP timeout; never cancelled, so a response that arrived is read. */
  authenticate(secret: string): Promise<KidSignIn>;
  /** Ends `accessToken`'s session. Best effort; never throws. */
  signOut(accessToken: string): Promise<void>;
}

export type AddKidError =
  | {
      kind:
        | "notAvailable"
        | "limitReached"
        | "nameTaken"
        | "pickLevel"
        | "accessInactive"
        | "signInAgain"
        | "kidNotActive"
        | "network"
        | "generic";
    }
  | { kind: "rateLimited"; minutes: number | null };

export type Retry =
  | { kind: "none" }
  /** Finish a paired kid's sign-in, or pair again. */
  | { kind: "pair" }
  | { kind: "create"; name: string; level: KidLevel }
  | { kind: "connect"; kid: KidProfile };

export type NameError = "invalid" | "taken";

export interface FormStep {
  kind: "form";
  name: string;
  level: KidLevel | null;
  nameError?: NameError;
  error?: AddKidError;
}

export type AddKidStep =
  /** "Create a new kid profile" or "Add an existing kid profile". */
  | { kind: "chooseHow" }
  /**
   * `code` is the pairing code shown (null while one is fetched), `kids` the account's own kids not
   * on this phone yet, `trouble` set while the server can't be reached (it keeps trying).
   */
  | {
      kind: "pairing";
      code: string | null;
      kids: KidProfile[];
      trouble: boolean;
    }
  /** The code was approved for a grown-up's profile; nothing was kept. */
  | { kind: "pairingRefused" }
  | FormStep
  | {
      kind: "pickPicture";
      name: string;
      level: KidLevel;
      selected: string | null;
    }
  | { kind: "working"; work: "creating" | "connecting"; kidName: string }
  | { kind: "failed"; error: AddKidError; retry: Retry }
  | { kind: "done" };

export interface AddKidDeps {
  /** The verified grown-up's own media token, for the website's kid routes. */
  parentToken: string;
  kids: KidProfilesClient;
  quickConnect: KidQuickConnect;
  /** Hands the kid's sign-in over. A rejection keeps the flow open with a retry. */
  onKid: (profile: {
    accessToken: string;
    user: UserDto;
    displayName?: string;
  }) => Promise<void>;
  /** Saves a picked picture with the kid's own session. A failure never blocks signing in. */
  savePicture: (kid: KidSignIn, avatarId: string) => Promise<void>;
  /** Whether there are pictures to pick from (otherwise the picture step is skipped). */
  hasAvatars: boolean;
  /** Jellyfin user ids already saved on this phone; their kids aren't offered again. */
  savedUserIds?: () => readonly string[];
  newKey?: () => string;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export const POLL_MS = 1_000;
export const MAX_POLLS = 30;
export const IN_PROGRESS_WAIT_MS = 2_000;
export const MAX_IN_PROGRESS_WAITS = 5;
/** Contract 12.3: how often the pairing code is polled, and the longest wait after failures. */
export const PAIR_POLL_MS = 2_000;
export const MAX_PAIR_BACKOFF_MS = 30_000;

/** The wait after `failures` failures in a row: doubling from twice the poll, at most 30 s. */
export function backoffMillis(failures: number): number {
  const n = Math.min(Math.max(failures, 1), 4);
  return Math.min(PAIR_POLL_MS * 2 ** n, MAX_PAIR_BACKOFF_MS);
}

/** Section 1 kid signal: a kid's policy has a MaxParentalRating; an adult's (or no policy) doesn't. */
export function isKidUser(user: UserDto | null | undefined): boolean {
  return user?.Policy?.MaxParentalRating != null;
}

/** A 6-digit code as "123 456", easier to read and type. */
export function formatPairingCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Contract 4: media user ids compare without dashes or case. */
export function normalisedUserId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export function errorFor(
  problem: Extract<KidApiResult<unknown>, { kind: "problem" }>,
): AddKidError {
  switch (problem.code) {
    case KidProblemCodes.KIDS_UNAVAILABLE:
      return { kind: "notAvailable" };
    case KidProblemCodes.KID_LIMIT_REACHED:
      return { kind: "limitReached" };
    case KidProblemCodes.ACCESS_REQUIRED:
      return { kind: "accessInactive" };
    case KidProblemCodes.AUTHENTICATION_REQUIRED:
      return { kind: "signInAgain" };
    case KidProblemCodes.KID_NOT_ACTIVE:
      return { kind: "kidNotActive" };
    case KidProblemCodes.KID_NAME_TAKEN:
      return { kind: "nameTaken" };
    case KidProblemCodes.RATE_LIMITED:
      return {
        kind: "rateLimited",
        minutes:
          problem.retryAfterMillis != null
            ? Math.max(1, Math.ceil(problem.retryAfterMillis / 60_000))
            : null,
      };
    default:
      return { kind: "generic" };
  }
}

class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Cancelled());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Cancelled());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function defaultKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 shape from Math.random (only an idempotency key, never a secret).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class AddKidController {
  private step: AddKidStep = { kind: "chooseHow" };
  private readonly listeners = new Set<(step: AddKidStep) => void>();
  private job: AbortController | null = null;
  private closed = false;

  // One Idempotency-Key per form submission (name + level), reused on every retry of it.
  private pendingKey: string | null = null;
  private pendingBody: string | null = null;
  private form: FormStep = { kind: "form", name: "", level: null };
  private avatarId: string | null = null;

  /** A paired kid's sign-in the flow still owns (signed out if the flow is left first). */
  private pendingPair: KidSignIn | null = null;
  /** Whether the flow still owns `pendingPair`'s token: not once the caller may have kept it. */
  private pendingPairOwned = false;

  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly newKey: () => string;

  constructor(private readonly deps: AddKidDeps) {
    this.sleep = deps.sleep ?? defaultSleep;
    this.newKey = deps.newKey ?? defaultKey;
  }

  getStep(): AddKidStep {
    return this.step;
  }

  subscribe(listener: (step: AddKidStep) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** "Create a new kid profile" (contract 5.4 create). */
  createNew(): void {
    this.stopJob();
    this.setStep(this.form);
  }

  /** "Add an existing kid profile" (contract 12.3); also "Get a new code" after a refused one. */
  addExisting(): Promise<void> {
    return this.launch((signal) => this.pair(signal));
  }

  updateForm(change: { name?: string; level?: KidLevel | null }): void {
    this.form = {
      kind: "form",
      name: change.name ?? this.form.name,
      level: change.level !== undefined ? change.level : this.form.level,
    };
    this.setStep(this.form);
  }

  submitForm(): Promise<void> | undefined {
    const name = validKidNameOrNull(this.form.name);
    const level = this.form.level;
    if (name === null) return void this.showForm({ nameError: "invalid" });
    if (level === null)
      return void this.showForm({ error: { kind: "pickLevel" } });
    if (!this.deps.hasAvatars) return this.create(name, level);
    this.setStep({ kind: "pickPicture", name, level, selected: this.avatarId });
    return undefined;
  }

  /** Picture step: `avatarId` is saved once the kid signs in; null skips it. */
  pickPicture(avatarId: string | null): Promise<void> | undefined {
    this.avatarId = avatarId;
    const name = validKidNameOrNull(this.form.name);
    const level = this.form.level;
    if (name === null) return void this.showForm({ nameError: "invalid" });
    if (level === null)
      return void this.showForm({ error: { kind: "pickLevel" } });
    return this.create(name, level);
  }

  signInExisting(kid: KidProfile): Promise<void> {
    this.avatarId = null;
    return this.launch((signal) => this.connectNow(kid, signal));
  }

  retry(): Promise<void> | undefined {
    const step = this.step;
    if (step.kind !== "failed") return undefined;
    const retry = step.retry;
    switch (retry.kind) {
      case "pair":
        return this.launch((signal) => {
          const kept = this.pendingPair;
          return kept ? this.finishPairing(kept) : this.pair(signal);
        });
      case "create":
        return this.create(retry.name, retry.level);
      case "connect":
        return this.signInExisting(retry.kid);
      case "none":
        return undefined;
    }
  }

  /**
   * One step back inside the flow. False when there is nothing to go back to and the flow should
   * close (the caller then calls `cancel`).
   */
  back(): boolean {
    switch (this.step.kind) {
      case "pickPicture":
        this.showForm({});
        return true;
      case "form":
      case "pairing":
      case "pairingRefused":
        this.stopJob();
        this.abandonPendingPair();
        this.setStep({ kind: "chooseHow" });
        return true;
      default:
        return false;
    }
  }

  /** Leaving the flow: stops what is running, and a kid's sign-in it still owns is signed out. */
  cancel(): void {
    this.closed = true;
    this.stopJob();
    this.abandonPendingPair();
  }

  // --- internals ---

  private setStep(step: AddKidStep) {
    this.step = step;
    if (this.closed) return;
    for (const listener of this.listeners) listener(step);
  }

  private showForm(errors: { nameError?: NameError; error?: AddKidError }) {
    this.form = {
      kind: "form",
      name: this.form.name,
      level: this.form.level,
      ...errors,
    };
    this.setStep(this.form);
  }

  private fail(error: AddKidError, retry: Retry) {
    this.setStep({ kind: "failed", error, retry });
  }

  private stopJob() {
    this.job?.abort();
    this.job = null;
  }

  private launch(block: (signal: AbortSignal) => Promise<void>): Promise<void> {
    this.stopJob();
    const job = new AbortController();
    this.job = job;
    return block(job.signal).catch((error) => {
      if (error instanceof Cancelled || job.signal.aborted) return;
      console.warn("Add kid flow failed", error);
      this.fail({ kind: "generic" }, { kind: "none" });
    });
  }

  private check(signal: AbortSignal) {
    if (signal.aborted) throw new Cancelled();
  }

  private abandonPendingPair() {
    const abandoned = this.pendingPair;
    const owned = this.pendingPairOwned;
    this.pendingPair = null;
    this.pendingPairOwned = false;
    if (abandoned && owned) this.signOutAbandoned(abandoned);
  }

  private signOutAbandoned(auth: KidSignIn) {
    // Its own promise, so leaving the flow doesn't stop it.
    void this.deps.quickConnect.signOut(auth.accessToken);
  }

  /**
   * Quick Connect's sign-in, owned by the flow from the moment the server issues the token. The
   * request runs to the end even if the flow is left meanwhile; then the token is signed out.
   */
  private async authenticateOwned(
    secret: string,
    signal: AbortSignal,
  ): Promise<KidSignIn> {
    const auth = await this.deps.quickConnect.authenticate(secret);
    if (signal.aborted) {
      this.signOutAbandoned(auth);
      throw new Cancelled();
    }
    return auth;
  }

  /**
   * Contract 12.3: a Quick Connect code the kid's page on the website approves, renewed by itself
   * when it expires, beside this account's own kids that aren't on this phone yet. Runs until a
   * sign-in arrives or the screen is left.
   */
  private async pair(signal: AbortSignal): Promise<void> {
    this.abandonPendingPair();
    this.setStep({ kind: "pairing", code: null, kids: [], trouble: false });
    void this.loadOwnKids(signal).catch(() => {});
    await this.runPairing(signal);
  }

  /** This account's own active kids that aren't saved on this phone yet; best effort. */
  private async loadOwnKids(signal: AbortSignal) {
    const result = await this.deps.kids.list(this.deps.parentToken);
    if (signal.aborted) return;
    if (result.kind !== "ok") {
      console.info("Couldn't list the account's kids for pairing");
      return;
    }
    const here = new Set(
      (this.deps.savedUserIds?.() ?? []).map(normalisedUserId),
    );
    const kids = result.value.kids.filter(
      (kid) =>
        kid.state === "active" &&
        kid.mediaUserId != null &&
        !here.has(normalisedUserId(kid.mediaUserId)),
    );
    this.updatePairing((step) => ({ ...step, kids }));
  }

  private updatePairing(
    transform: (
      step: Extract<AddKidStep, { kind: "pairing" }>,
    ) => Extract<AddKidStep, { kind: "pairing" }>,
  ) {
    if (this.step.kind === "pairing") this.setStep(transform(this.step));
  }

  /** Shows a code, polls it, and gets a new one when it expires; failures back off. */
  private async runPairing(signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (true) {
      this.check(signal);
      let code: { code: string; secret: string };
      try {
        code = await this.deps.quickConnect.initiate();
      } catch {
        this.check(signal);
        this.updatePairing((step) => ({ ...step, code: null, trouble: true }));
        await this.sleep(backoffMillis(++failures), signal);
        continue;
      }
      this.check(signal);
      failures = 0;
      this.updatePairing((step) => ({
        ...step,
        code: code.code,
        trouble: false,
      }));
      if ((await this.awaitPairing(code.secret, signal)) === "expired")
        continue;
      let auth: KidSignIn;
      try {
        auth = await this.authenticateOwned(code.secret, signal);
      } catch (error) {
        if (error instanceof Cancelled) throw error;
        await this.sleep(backoffMillis(++failures), signal);
        continue;
      }
      return isKidUser(auth.user)
        ? this.finishPairing(auth)
        : this.refuse(auth);
    }
  }

  /** Polls `secret` every 2 s until it is approved or expires; a failed poll backs off. */
  private async awaitPairing(
    secret: string,
    signal: AbortSignal,
  ): Promise<QuickConnectPoll> {
    let failures = 0;
    while (true) {
      await this.sleep(
        failures === 0 ? PAIR_POLL_MS : backoffMillis(failures),
        signal,
      );
      let poll: QuickConnectPoll;
      try {
        poll = await this.deps.quickConnect.poll(secret);
      } catch {
        this.check(signal);
        failures++;
        this.updatePairing((step) => ({ ...step, trouble: true }));
        continue;
      }
      this.check(signal);
      if (failures > 0) {
        failures = 0;
        this.updatePairing((step) => ({ ...step, trouble: false }));
      }
      if (poll !== "waiting") return poll;
    }
  }

  /** Contract 12.3: a grown-up's approval is never kept, and its token is signed out. */
  private async refuse(auth: KidSignIn) {
    await this.deps.quickConnect.signOut(auth.accessToken);
    this.setStep({ kind: "pairingRefused" });
  }

  /** Contract 12.3: the paired kid is handed over, named as on the server. */
  private async finishPairing(auth: KidSignIn): Promise<void> {
    const name = auth.user.Name?.trim() || undefined;
    this.setStep({ kind: "working", work: "connecting", kidName: name ?? "" });
    // Handed over, and the caller may keep it: from here leaving the flow must not sign it out.
    this.pendingPair = null;
    this.pendingPairOwned = false;
    try {
      await this.deps.onKid({
        accessToken: auth.accessToken,
        user: auth.user,
        displayName: name,
      });
    } catch (error) {
      // Possibly kept before it failed, so it is never signed out; a retry hands it over again.
      console.warn("Paired kid sign-in failed", error);
      this.pendingPair = auth;
      this.pendingPairOwned = false;
      return this.fail({ kind: "generic" }, { kind: "pair" });
    }
    this.setStep({ kind: "done" });
  }

  private create(name: string, level: KidLevel): Promise<void> {
    return this.launch(async (signal) => {
      const body = JSON.stringify([name, level]);
      if (this.pendingBody !== body || this.pendingKey === null) {
        this.pendingKey = this.newKey();
        this.pendingBody = body;
      }
      const key = this.pendingKey;
      this.setStep({ kind: "working", work: "creating", kidName: name });
      let inProgressWaits = 0;
      while (true) {
        const result = await this.deps.kids.create(
          this.deps.parentToken,
          key,
          name,
          level,
        );
        this.check(signal);
        if (result.kind === "ok") {
          this.pendingKey = null;
          this.pendingBody = null;
          return this.connectNow(result.value, signal);
        }
        if (result.kind === "network")
          return this.fail(
            { kind: "network" },
            { kind: "create", name, level },
          );
        switch (result.code) {
          case KidProblemCodes.REQUEST_IN_PROGRESS:
            if (inProgressWaits++ < MAX_IN_PROGRESS_WAITS) {
              await this.sleep(IN_PROGRESS_WAIT_MS, signal);
              continue;
            }
            return this.fail(
              { kind: "generic" },
              { kind: "create", name, level },
            );
          case KidProblemCodes.KID_NAME_TAKEN:
            return this.showForm({ nameError: "taken" });
          case KidProblemCodes.INVALID_REQUEST:
            return this.showForm({ nameError: "invalid" });
          case KidProblemCodes.IDEMPOTENCY_CONFLICT:
            // Bug guard: the next attempt gets a fresh key.
            this.pendingKey = null;
            this.pendingBody = null;
            return this.fail(
              { kind: "generic" },
              { kind: "create", name, level },
            );
          default:
            return this.fail(errorFor(result), { kind: "create", name, level });
        }
      }
    });
  }

  private async connectNow(
    kid: KidProfile,
    signal: AbortSignal,
  ): Promise<void> {
    this.setStep({
      kind: "working",
      work: "connecting",
      kidName: kid.displayName,
    });
    const retry: Retry = { kind: "connect", kid };
    let freshCodes = 0;
    while (true) {
      let code: { code: string; secret: string };
      try {
        code = await this.deps.quickConnect.initiate();
      } catch {
        this.check(signal);
        return this.fail({ kind: "network" }, retry);
      }
      this.check(signal);
      const result = await this.deps.kids.connect(
        this.deps.parentToken,
        kid.id,
        code.code,
      );
      this.check(signal);
      if (result.kind === "network")
        return this.fail({ kind: "network" }, retry);
      if (result.kind === "problem") {
        switch (result.code) {
          case KidProblemCodes.QUICK_CONNECT_INVALID_CODE:
            // Expired or used code: a new code for the same kid, once.
            if (freshCodes++ < 1) continue;
            return this.fail({ kind: "generic" }, retry);
          case KidProblemCodes.KID_NOT_FOUND:
            // Contract 3.2: refresh the list (the pairing screen loads it again).
            return this.pair(signal);
          default:
            return this.fail(errorFor(result), retry);
        }
      }
      if (!(await this.awaitAuthenticated(code.secret, signal))) {
        if (freshCodes++ < 1) continue;
        return this.fail({ kind: "generic" }, retry);
      }
      let auth: KidSignIn;
      try {
        auth = await this.authenticateOwned(code.secret, signal);
      } catch (error) {
        if (error instanceof Cancelled) throw error;
        return this.fail({ kind: "generic" }, retry);
      }
      const displayName = result.value.displayName.trim() || kid.displayName;
      const avatarId = this.avatarId;
      if (avatarId) {
        // The kid's own session saves the picture; a failure never blocks signing in.
        try {
          await this.deps.savePicture(auth, avatarId);
        } catch {
          console.warn("Kid picture not saved; it can be changed later");
        }
      }
      if (signal.aborted) {
        this.signOutAbandoned(auth);
        throw new Cancelled();
      }
      try {
        await this.deps.onKid({
          accessToken: auth.accessToken,
          user: auth.user,
          displayName,
        });
      } catch (error) {
        // Possibly kept before it failed, so it is never signed out; a retry uses a new code.
        console.warn("Kid sign-in failed", error);
        return this.fail({ kind: "generic" }, retry);
      }
      this.setStep({ kind: "done" });
      return;
    }
  }

  private async awaitAuthenticated(
    secret: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    for (let i = 0; i < MAX_POLLS; i++) {
      let authenticated: boolean;
      try {
        authenticated = await this.deps.quickConnect.isAuthenticated(secret);
      } catch {
        this.check(signal);
        return false;
      }
      this.check(signal);
      if (authenticated) return true;
      await this.sleep(POLL_MS, signal);
    }
    return false;
  }
}
