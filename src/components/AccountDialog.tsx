import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { AppLocale } from "../lib/i18n";
import { accountText } from "../lib/accountLocale";
import { accountSettingsText } from "../lib/accountSettingsLocale";
import { AvatarImageError, prepareAvatarUpload } from "../lib/avatarImage";
import { backend } from "../lib/backend";
import type { AccountPasswordSetup, AccountProfile } from "../lib/accountTypes";
import { AccountSettingsPanel } from "./AccountSettingsPanel";
import { Icon } from "./Icon";

type AccountView = "checking" | "login" | "login-code" | "enroll-email" | "enroll-code" | "enroll-password" | "reset" | "profile" | "security" | "plan" | "settings";

const emailIsValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const passwordIsValid = (value: string) => {
  const points = Array.from(value).length;
  return points >= 15 && points <= 128 && new TextEncoder().encode(value).byteLength <= 512;
};
const displayNameIsValid = (value: string) => {
  const normalized = value.trim();
  return Array.from(normalized).length >= 1 && Array.from(normalized).length <= 32 && !/[\u0000-\u001f\u007f]/u.test(normalized);
};

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [setup, setSetup] = useState<AccountPasswordSetup | null>(null);
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? "");
  const [loading, setLoading] = useState(!profileLoaded && !initialProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previousInitialProfile = useRef(initialProfile);

  const publishProfile = useCallback((next: AccountProfile | null) => {
    setProfile(next);
    onProfileChange(next);
    if (next) setDisplayName(next.displayName ?? "");
  }, [onProfileChange]);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

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

  const requestLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!emailIsValid(normalized)) { setError(copy.enterEmail); return; }
    if (!passwordIsValid(password)) { setError(copy.passwordInvalid); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const challenge = await backend.accountPasswordLogin(normalized, password);
      setSentTo(normalized);
      setChallengeId(challenge.challengeId);
      setPassword("");
      setCode("");
      setNotice(`${copy.codeSent} ${normalized}`);
      setView("login-code");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const verifyLoginCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError(copy.enterCode); return; }
    setBusy(true);
    setError("");
    try {
      const signedIn = await backend.accountVerifyLoginCode(challengeId, code);
      publishProfile(signedIn);
      setCode("");
      setChallengeId("");
      setSentTo("");
      setNotice("");
      setView("profile");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const requestEnrollmentCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!emailIsValid(normalized)) { setError(copy.enterEmail); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await backend.accountRequestEnrollmentCode(normalized);
      setEmail(normalized);
      setSentTo(normalized);
      setCode("");
      setNotice(`${copy.enrollmentSent} ${normalized}`);
      setView("enroll-code");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const verifyEnrollmentCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError(copy.enterCode); return; }
    setBusy(true);
    setError("");
    try {
      setSetup(await backend.accountVerifyEnrollmentCode(sentTo, code));
      setCode("");
      setNotice("");
      setView("enroll-password");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const enrollPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup) { setError(copy.enterCode); return; }
    if (!passwordIsValid(password)) { setError(copy.passwordInvalid); return; }
    if (password !== confirmPassword) { setError(copy.passwordMismatch); return; }
    setBusy(true);
    setError("");
    try {
      await backend.accountEnrollPassword(sentTo, setup.setupToken, password);
      setPassword("");
      setConfirmPassword("");
      setSetup(null);
      if (profile) publishProfile({ ...profile, hasPassword: true });
      setNotice(copy.passwordEnrolled);
      setView(profile ? "security" : "login");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!emailIsValid(normalized)) { setError(copy.enterEmail); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await backend.accountRequestPasswordReset(normalized);
      setNotice(copy.resetSent);
    } catch (reason) {
      setError(String(reason));
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

  const requestCurrentPasswordSetup = async () => {
    if (!profile) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await backend.accountRequestEnrollmentCode(profile.email);
      setSentTo(profile.email);
      setCode("");
      setSetup(null);
      setNotice(`${copy.enrollmentSent} ${profile.email}`);
      setView("enroll-code");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
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
      setSentTo("");
      setChallengeId("");
      setCode("");
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
    : view === "login" || view === "login-code" ? copy.title
    : view === "enroll-email" || view === "enroll-code" || view === "enroll-password" ? copy.enroll
      : view === "reset" ? copy.forgotPassword
        : view === "security" ? copy.security : copy.accountSettings;
  const settingsOpen = Boolean(profile && (view === "profile" || view === "security" || view === "plan" || view === "settings"));
  const compact = view === "checking";

  return (
    <div className={`modal-backdrop account-backdrop${compact ? " account-profile-backdrop" : ""}`} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className={`wizard account-dialog${compact ? " account-dialog-popover" : ""}${settingsOpen ? " account-settings-dialog" : ""}`} role="dialog" aria-modal="true" aria-label={compact ? copy.profileSettings : undefined} aria-labelledby={compact ? undefined : "account-dialog-title"}>
        {settingsOpen && profile ? <AccountSettingsPanel locale={locale} profile={profile} view={view as "profile" | "security" | "plan" | "settings"}
          displayName={displayName} busy={busy} isDesktop={backend.isDesktop} notice={notice} error={error} avatarInput={avatarInput}
          onViewChange={(next) => { setView(next); setError(""); setNotice(""); }} onDisplayNameChange={setDisplayName}
          onSaveDisplayName={(event) => void updateDisplayName(event)} onUploadAvatar={(event) => void uploadAvatar(event)}
          onRemoveAvatar={() => void removeAvatar()} onPasswordChange={() => void (profile.hasPassword ? requestCurrentPasswordReset() : requestCurrentPasswordSetup())}
          onSignOut={() => void signOut()} onClose={onClose} />
          : view === "checking" ? <div className="account-profile-loading" role="status"><span className="spinner" /><strong>{copy.loading}</strong></div> : <>
          <header className="wizard-header account-dialog-header">
            <div><p className="wizard-kicker">TOMONODE</p><h2 id="account-dialog-title">{title}</h2></div>
            <button className="icon-button" type="button" aria-label={copy.close} title={copy.close} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          <div className="wizard-body account-dialog-body">
            {loading ? <p role="status">{copy.loading}</p> : null}
            {!backend.isDesktop ? <p className="info-callout"><Icon name="info" size={18} />{copy.windowsOnly}</p> : null}

            {view === "login" ? <>
              <p>{copy.intro}</p>
              <form className="form-stack account-form" onSubmit={(event) => void requestLogin(event)}>
                <label><span>{copy.email}</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
                <label><span>{copy.password}</span><input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
                <button className="primary-button" type="submit" disabled={busy || loading || !backend.isDesktop}><Icon name="user" size={18} />{busy ? copy.loading : copy.login}</button>
              </form>
              <p className="field-help">{copy.passwordHint}</p>
              <div className="account-auth-links">
                <button type="button" onClick={() => { setView("enroll-email"); setError(""); setNotice(""); }}>{copy.enroll}</button>
                <button type="button" onClick={() => { setView("reset"); setError(""); setNotice(""); }}>{copy.forgotPassword}</button>
              </div>
              {notice ? <p className="compatibility good" role="status">{notice}</p> : null}
            </> : null}

            {view === "login-code" ? <form className="form-stack account-form" onSubmit={(event) => void verifyLoginCode(event)}>
              <p role="status">{notice || `${copy.codeSent} ${sentTo}`}</p>
              <label><span>{copy.code}</span><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} /></label>
              <button className="primary-button" type="submit" disabled={busy || !backend.isDesktop || code.length !== 6}>{busy ? copy.loading : copy.verifyCode}</button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => { setView("login"); setCode(""); setChallengeId(""); setNotice(""); setError(""); }}>{copy.resend}</button>
            </form> : null}

            {view === "enroll-email" ? <>
              <p>{copy.enrollmentSent}</p>
              <form className="form-stack account-form" onSubmit={(event) => void requestEnrollmentCode(event)}>
                <label><span>{copy.email}</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
                <button className="primary-button" type="submit" disabled={busy || loading || !backend.isDesktop}>{busy ? copy.loading : copy.sendCode}</button>
              </form>
              <button className="small-button" type="button" onClick={() => { setView("login"); setError(""); setNotice(""); }}>{copy.backToLogin}</button>
            </> : null}

            {view === "enroll-code" ? <form className="form-stack account-form" onSubmit={(event) => void verifyEnrollmentCode(event)}>
              <p role="status">{notice || `${copy.enrollmentSent} ${sentTo}`}</p>
              <label><span>{copy.code}</span><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} /></label>
              <button className="primary-button" type="submit" disabled={busy || !backend.isDesktop || code.length !== 6}>{busy ? copy.loading : copy.continue}</button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => { setView("enroll-email"); setCode(""); setError(""); setNotice(""); }}>{copy.resend}</button>
            </form> : null}

            {view === "enroll-password" ? <>
              <p>{copy.enrollmentSent} {sentTo}</p>
              <form className="form-stack account-form" onSubmit={(event) => void enrollPassword(event)}>
                <label><span>{copy.password}</span><input type="password" autoComplete="new-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
                <label><span>{copy.confirmPassword}</span><input type="password" autoComplete="new-password" required maxLength={256} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={busy} /></label>
                <small className="field-help">{copy.passwordHint}</small>
                <button className="primary-button" type="submit" disabled={busy || !backend.isDesktop}>{busy ? copy.loading : copy.setPassword}</button>
              </form>
            </> : null}

            {view === "reset" ? <>
              <p>{copy.resetSent}</p>
              <form className="form-stack account-form" onSubmit={(event) => void requestPasswordReset(event)}>
                <label><span>{copy.email}</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
                <button className="primary-button" type="submit" disabled={busy || !backend.isDesktop}>{busy ? copy.loading : copy.requestReset}</button>
              </form>
              {notice ? <p className="compatibility good" role="status">{notice}</p> : null}
              <button className="small-button" type="button" onClick={() => { setView("login"); setError(""); setNotice(""); }}>{copy.backToLogin}</button>
            </> : null}

            {error ? <p className="error-banner" role="alert"><Icon name="info" size={17} />{error}</p> : null}
          </div>
          <footer className="wizard-footer"><span>{view === "profile" ? copy.deviceLoginActive : ""}</span><button className="secondary-button" type="button" onClick={onClose}>{copy.close}</button></footer>
        </>}
      </section>
    </div>
  );
}
