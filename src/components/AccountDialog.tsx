import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { AppLocale } from "../lib/i18n";
import { accountText } from "../lib/accountLocale";
import { accountSettingsText } from "../lib/accountSettingsLocale";
import { AvatarImageError, prepareAvatarUpload } from "../lib/avatarImage";
import { backend } from "../lib/backend";
import type { AccountBrowserAuthMode, AccountBrowserAuthStart, AccountProfile } from "../lib/accountTypes";
import { openExternalUrl } from "./ExternalLinkHandler";
import { AccountSettingsPanel } from "./AccountSettingsPanel";
import { Icon } from "./Icon";

type AccountView = "checking" | "login" | "profile" | "security" | "plan";

const displayNameIsValid = (value: string) => {
  const normalized = value.trim();
  return Array.from(normalized).length >= 1 && Array.from(normalized).length <= 32 && !/[\u0000-\u001f\u007f]/u.test(normalized);
};

interface BrowserAuthUiAttempt {
  clientAttemptId: string;
  start: AccountBrowserAuthStart | null;
  expiresAt: number | null;
}

function newBrowserAuthAttemptId() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface Props {
  locale: AppLocale;
  initialProfile: AccountProfile | null;
  profileLoaded: boolean;
  onProfileChange: (profile: AccountProfile | null) => void;
  onClose: () => void;
}

export function AccountDialog({ locale, initialProfile, profileLoaded, onProfileChange, onClose }: Props) {
  const copy = useMemo(() => accountText(locale), [locale]);
  const settingsCopy = useMemo(() => accountSettingsText(locale), [locale]);
  const [view, setView] = useState<AccountView>(profileLoaded ? initialProfile ? "profile" : "login" : "checking");
  const [profile, setProfile] = useState<AccountProfile | null>(initialProfile);
  const [browserAttempt, setBrowserAttempt] = useState<BrowserAuthUiAttempt | null>(null);
  const [browserPollPaused, setBrowserPollPaused] = useState(false);
  const [browserSecondsLeft, setBrowserSecondsLeft] = useState(0);
  const [browserPollRetry, setBrowserPollRetry] = useState(0);
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? "");
  const [loading, setLoading] = useState(!profileLoaded && !initialProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previousInitialProfile = useRef(initialProfile);
  const browserClientAttemptIdRef = useRef<string | null>(null);
  const browserPollInFlightRef = useRef<string | null>(null);
  const browserReturnViewRef = useRef<AccountView>("login");
  // A billing action can require re-authentication. Keep its destination while
  // the browser login is in progress so a successful login returns to Plan.
  const loginReturnViewRef = useRef<"profile" | "plan">("profile");

  const publishProfile = useCallback((next: AccountProfile | null) => {
    setProfile(next);
    onProfileChange(next);
    if (next) setDisplayName(next.displayName ?? "");
  }, [onProfileChange]);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => () => {
    const clientAttemptId = browserClientAttemptIdRef.current;
    browserClientAttemptIdRef.current = null;
    if (clientAttemptId) void backend.accountBrowserAuthCancel(clientAttemptId).catch(() => undefined);
  }, []);

  useEffect(() => {
    const previous = previousInitialProfile.current;
    if (initialProfile !== previous) {
      previousInitialProfile.current = initialProfile;
      setProfile(initialProfile);
      if (initialProfile) setDisplayName(initialProfile.displayName ?? "");
      if (!previous && initialProfile) {
        setView("profile");
        setLoading(false);
      } else if (previous && !initialProfile && profileLoaded) {
        setView("login");
      }
    }
    if (profileLoaded) {
      setLoading(false);
      if (!initialProfile && !previous) setView("login");
    }
  }, [initialProfile, profileLoaded]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hidden && element.tabIndex >= 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => { dialogRef.current?.focus(); }, [view]);

  const startBrowserAuth = async (mode: AccountBrowserAuthMode, returnView?: "profile" | "plan") => {
    if (!backend.isDesktop || browserClientAttemptIdRef.current) return;
    let clientAttemptId: string;
    try {
      clientAttemptId = newBrowserAuthAttemptId();
    } catch {
      setError(copy.browserAuthFailed);
      return;
    }
    if (returnView) loginReturnViewRef.current = returnView;
    browserReturnViewRef.current = profile ? view === "security" ? "security" : "profile" : "login";
    browserClientAttemptIdRef.current = clientAttemptId;
    setBrowserAttempt({ clientAttemptId, start: null, expiresAt: null });
    setBrowserPollPaused(false);
    setBusy(true);
    setError("");
    setNotice("");
    setView("login");
    try {
      const start = await backend.accountBrowserAuthStart(clientAttemptId, mode, locale === "ja" ? "ja" : "en");
      if (browserClientAttemptIdRef.current !== clientAttemptId) {
        void backend.accountBrowserAuthCancel(clientAttemptId).catch(() => undefined);
        return;
      }
      setBrowserAttempt({ clientAttemptId, start, expiresAt: Date.now() + start.expiresInSeconds * 1000 });
      setBrowserSecondsLeft(start.expiresInSeconds);
      setBusy(false);
      try {
        await openExternalUrl(start.browserUrl);
      } catch {
        if (browserClientAttemptIdRef.current === clientAttemptId) setError(copy.browserAuthOpenFailed);
      }
    } catch {
      if (browserClientAttemptIdRef.current === clientAttemptId) {
        setBusy(false);
        browserClientAttemptIdRef.current = null;
        setBrowserAttempt(null);
        setView(browserReturnViewRef.current);
        setError(copy.browserAuthFailed);
      }
      void backend.accountBrowserAuthCancel(clientAttemptId).catch(() => undefined);
    } finally {
      if (browserClientAttemptIdRef.current === clientAttemptId) setBusy(false);
    }
  };

  const reopenBrowserAuth = async () => {
    if (!browserAttempt?.start) return;
    setError("");
    try {
      await openExternalUrl(browserAttempt.start.browserUrl);
    } catch {
      setError(copy.browserAuthOpenFailed);
    }
  };

  const cancelBrowserAuth = async () => {
    const clientAttemptId = browserClientAttemptIdRef.current;
    if (!clientAttemptId) return;
    browserClientAttemptIdRef.current = null;
    setBrowserAttempt(null);
    setBrowserPollPaused(false);
    setBrowserSecondsLeft(0);
    setView(browserReturnViewRef.current);
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await backend.accountBrowserAuthCancel(clientAttemptId);
    } catch {
      setError(copy.browserAuthFailed);
    } finally {
      setBusy(false);
    }
  };

  const requestCurrentPasswordReset = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await backend.accountRequestPasswordReset();
      setNotice(copy.resetSent);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const requestEmailChange = async (newEmail: string, currentPassword: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await backend.accountRequestEmailChange(newEmail, currentPassword);
      setNotice(settingsCopy.emailChangeRequested);
    } catch (reason) {
      setError(String(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  const clearAccountFeedback = () => {
    setError("");
    setNotice("");
  };

  useEffect(() => {
    const attempt = browserAttempt;
    if (!attempt?.start || browserPollPaused) return;
    const { clientAttemptId, start } = attempt;
    let stopped = false;
    let timer: number | undefined;
    const intervalMs = Math.max(1, start.intervalSeconds) * 1000;

    const poll = async () => {
      if (stopped || browserClientAttemptIdRef.current !== clientAttemptId) return;
      if (browserPollInFlightRef.current === clientAttemptId) {
        timer = window.setTimeout(() => void poll(), intervalMs);
        return;
      }
      browserPollInFlightRef.current = clientAttemptId;
      let continuePolling = true;
      try {
        const result = await backend.accountBrowserAuthPoll(start.requestId);
        if (result.status === "complete" && result.account) {
          continuePolling = false;
          browserClientAttemptIdRef.current = null;
          setBrowserAttempt(null);
          setBrowserPollPaused(false);
          setBrowserSecondsLeft(0);
          setError("");
          setNotice(copy.browserAuthSignedIn);
          publishProfile(result.account);
          setView(loginReturnViewRef.current);
        } else if (stopped || browserClientAttemptIdRef.current !== clientAttemptId) {
          return;
        } else if (result.status === "expired") {
          continuePolling = false;
          browserClientAttemptIdRef.current = null;
          setBrowserAttempt(null);
          setBrowserPollPaused(false);
          setBrowserSecondsLeft(0);
          setError(copy.browserAuthExpired);
          setView(browserReturnViewRef.current);
        }
      } catch {
        if (!stopped && browserClientAttemptIdRef.current === clientAttemptId) {
          continuePolling = false;
          setBrowserPollPaused(true);
          setError(copy.browserAuthFailed);
        }
      } finally {
        if (browserPollInFlightRef.current === clientAttemptId) browserPollInFlightRef.current = null;
        if (continuePolling && !stopped && browserClientAttemptIdRef.current === clientAttemptId) {
          timer = window.setTimeout(() => void poll(), intervalMs);
        }
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [browserAttempt, browserPollPaused, browserPollRetry, copy, publishProfile]);

  useEffect(() => {
    const attempt = browserAttempt;
    if (!attempt?.expiresAt) return;
    const { clientAttemptId, expiresAt } = attempt;
    const updateCountdown = () => {
      const secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setBrowserSecondsLeft(secondsLeft);
      if (secondsLeft === 0 && browserClientAttemptIdRef.current === clientAttemptId) {
        browserClientAttemptIdRef.current = null;
        setBrowserAttempt(null);
        setBrowserPollPaused(false);
        setError(copy.browserAuthExpired);
        setView(browserReturnViewRef.current);
        void backend.accountBrowserAuthCancel(clientAttemptId).catch(() => undefined);
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [browserAttempt, copy.browserAuthExpired]);

  const retryBrowserAuthPoll = () => {
    setError("");
    setBrowserPollPaused(false);
    setBrowserPollRetry((retry) => retry + 1);
  };

  const updateDisplayName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = displayName.trim();
    if (!displayNameIsValid(normalized)) { setError(copy.displayNameHint); return; }
    setBusy(true);
    setError("");
    try {
      const updated = await backend.accountUpdateDisplayName(normalized);
      publishProfile(updated);
      setNotice(copy.profileSaved);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      await backend.accountLogout();
      publishProfile(null);
      setNotice(copy.loggedOut);
      setView("login");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !profile) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareAvatarUpload(file);
      await backend.accountUploadAvatar(prepared.mimeType, prepared.dataBase64);
      publishProfile({ ...profile, avatarDataUrl: prepared.preview });
      setNotice(copy.profileSaved);
    } catch (reason) {
      setError(reason instanceof AvatarImageError
        ? reason.reason === "size" ? copy.avatarSizeError
          : reason.reason === "type" || reason.reason === "decode" ? settingsCopy.imageDecodeError : settingsCopy.imageEncodeError
        : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      await backend.accountRemoveAvatar();
      publishProfile({ ...profile, avatarDataUrl: null });
      setNotice(copy.profileSaved);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const title = view === "checking" ? copy.profileSettings
    : view === "login" ? copy.title
      : view === "security" ? copy.security : copy.accountSettings;
  const settingsOpen = Boolean(profile && (view === "profile" || view === "security" || view === "plan"));
  const compact = view === "checking";

  return (
    <div className={`modal-backdrop account-backdrop${compact ? " account-profile-backdrop" : ""}`} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className={`wizard account-dialog${compact ? " account-dialog-popover" : ""}${settingsOpen ? " account-settings-dialog" : ""}`} role="dialog" aria-modal="true" aria-label={compact ? copy.profileSettings : undefined} aria-labelledby={compact ? undefined : "account-dialog-title"}>
        {settingsOpen && profile ? <AccountSettingsPanel locale={locale} profile={profile} view={view as "profile" | "security" | "plan"}
          displayName={displayName} busy={busy} isDesktop={backend.isDesktop} notice={notice} error={error} avatarInput={avatarInput}
          onViewChange={(next) => { setView(next); setError(""); setNotice(""); }} onDisplayNameChange={setDisplayName}
          onSaveDisplayName={(event) => void updateDisplayName(event)} onUploadAvatar={(event) => void uploadAvatar(event)}
          onRemoveAvatar={() => void removeAvatar()} onPasswordChange={() => void (profile.hasPassword ? requestCurrentPasswordReset() : startBrowserAuth("register"))}
          onRequestEmailChange={requestEmailChange} onClearFeedback={clearAccountFeedback}
          onRequireLogin={() => {
            loginReturnViewRef.current = "plan";
            publishProfile(null);
            setError("");
            setNotice("");
            setView("login");
          }} onSignOut={() => void signOut()} onClose={onClose} />
          : view === "checking" ? <div className="account-profile-loading" role="status"><span className="spinner" /><strong>{copy.loading}</strong></div> : <>
          <header className="wizard-header account-dialog-header">
            <div><p className="wizard-kicker">TOMONODE</p><h2 id="account-dialog-title">{title}</h2></div>
            <button className="icon-button" type="button" aria-label={copy.close} title={copy.close} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          <div className="wizard-body account-dialog-body">
            {loading ? <p role="status">{copy.loading}</p> : null}
            {!backend.isDesktop ? <p className="info-callout"><Icon name="info" size={18} />{copy.windowsOnly}</p> : null}

            {view === "login" ? <>
              <p>{copy.browserAuthIntro}</p>
              {browserAttempt ? <div className="form-stack account-form account-browser-auth">
                {browserAttempt.start ? <>
                  <p role="status">{browserPollPaused ? copy.browserAuthFailed : copy.browserAuthWaiting}</p>
                  <div className="account-browser-auth-code">
                    <span>{copy.browserAuthCode}</span>
                    <output aria-label={copy.browserAuthCode}>{browserAttempt.start.userCode}</output>
                  </div>
                  <p className="field-help">{copy.browserAuthExpiresIn}: {Math.floor(browserSecondsLeft / 60)}:{String(browserSecondsLeft % 60).padStart(2, "0")}</p>
                  <button className="secondary-button" type="button" onClick={() => void reopenBrowserAuth()}>{copy.browserAuthReopen}</button>
                  {browserPollPaused ? <button className="primary-button" type="button" onClick={retryBrowserAuthPoll}>{copy.browserAuthRetry}</button> : null}
                </> : <p role="status">{copy.browserAuthStarting}</p>}
                <button className="secondary-button" type="button" onClick={() => void cancelBrowserAuth()}>{copy.browserAuthCancel}</button>
              </div> : <div className="form-stack account-form">
                <button className="primary-button" type="button" disabled={busy || loading || !backend.isDesktop} onClick={() => void startBrowserAuth("login", loginReturnViewRef.current)}><Icon name="user" size={18} />{busy ? copy.loading : copy.browserAuthLogin}</button>
                <button className="secondary-button" type="button" disabled={busy || loading || !backend.isDesktop} onClick={() => void startBrowserAuth("register")}>{copy.browserAuthRegister}</button>
              </div>}
              {notice ? <p className="compatibility good" role="status">{notice}</p> : null}
            </> : null}

            {error ? <p className="error-banner" role="alert"><Icon name="info" size={17} />{error}</p> : null}
          </div>
          <footer className="wizard-footer"><span>{view === "profile" ? copy.deviceLoginActive : ""}</span><button className="secondary-button" type="button" onClick={onClose}>{copy.close}</button></footer>
        </>}
      </section>
    </div>
  );
}
