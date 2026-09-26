import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { AppLocale } from "../lib/i18n";
import { accountText } from "../lib/accountLocale";
import { backend } from "../lib/backend";
import type { AccountAvatarMimeType, AccountPasswordSetup, AccountProfile } from "../lib/accountTypes";
import { Icon } from "./Icon";

type AccountView = "checking" | "login" | "login-code" | "enroll-email" | "enroll-code" | "enroll-password" | "reset" | "profile" | "security" | "settings";

const emailIsValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const passwordIsValid = (value: string) => {
  const points = Array.from(value).length;
  return points >= 15 && points <= 128 && new TextEncoder().encode(value).byteLength <= 512;
};
const displayNameIsValid = (value: string) => {
  const normalized = value.trim();
  return Array.from(normalized).length >= 1 && Array.from(normalized).length <= 32 && !/[\u0000-\u001f\u007f]/u.test(normalized);
};
const avatarTypes: readonly AccountAvatarMimeType[] = ["image/png", "image/jpeg", "image/webp"];

interface Props {
  locale: AppLocale;
  initialProfile: AccountProfile | null;
  profileLoaded: boolean;
  onProfileChange: (profile: AccountProfile | null) => void;
  onClose: () => void;
}

export function AccountDialog({ locale, initialProfile, profileLoaded, onProfileChange, onClose }: Props) {
  const copy = useMemo(() => accountText(locale), [locale]);
  const [view, setView] = useState<AccountView>(profileLoaded ? initialProfile ? "profile" : "login" : "checking");
  const [profile, setProfile] = useState<AccountProfile | null>(initialProfile);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [setup, setSetup] = useState<AccountPasswordSetup | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
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
        setEditingProfile(false);
        setLoading(false);
      } else if (previous && !initialProfile && profileLoaded) {
        setView("login");
        setEditingProfile(false);
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
      )).filter((element) => !element.hidden);
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
      setEditingProfile(false);
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
    if (!avatarTypes.includes(file.type as AccountAvatarMimeType)) { setError(copy.avatarTypeError); return; }
    if (file.size > 128 * 1024) { setError(copy.avatarSizeError); return; }
    const mimeType = file.type as AccountAvatarMimeType;
    setBusy(true);
    setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32 * 1024) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32 * 1024));
      }
      const dataBase64 = btoa(binary);
      const preview = `data:${mimeType};base64,${dataBase64}`;
      await backend.accountUploadAvatar(mimeType, dataBase64);
      publishProfile({ ...profile, avatarDataUrl: preview });
      setNotice(copy.profileSaved);
    } catch (reason) {
      setError(String(reason));
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
  const compact = view === "profile" || view === "checking";
  const displayLabel = profile?.displayName || profile?.email.split("@")[0] || "";

  return (
    <div className={`modal-backdrop account-backdrop${compact ? " account-profile-backdrop" : ""}`} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className={`wizard account-dialog${compact ? " account-dialog-popover" : ""}${editingProfile ? " is-editing" : ""}`} role="dialog" aria-modal="true" aria-label={compact ? copy.profileSettings : undefined} aria-labelledby={compact ? undefined : "account-dialog-title"}>
        {view === "checking" ? <div className="account-profile-loading" role="status"><span className="spinner" /><strong>{copy.loading}</strong></div> : null}
        {compact && profile ? <div className="account-profile-menu">
          <div className="account-profile-identity">
            <div className="account-profile-avatar">{profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : <Icon name="user" size={27} />}</div>
            <div className="account-profile-labels">
              {editingProfile ? <label className="account-display-name-field"><span>{copy.displayName}</span><input aria-label={copy.displayName} maxLength={32} value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={busy} /></label> : <strong title={displayLabel}>{displayLabel}</strong>}
              <span title={profile.email}>{profile.email}</span>
            </div>
            {!editingProfile ? <button className="account-edit-button" type="button" onClick={() => { setDisplayName(profile.displayName || ""); setEditingProfile(true); setError(""); setNotice(""); }}>{copy.edit}</button> : null}
            <input ref={avatarInput} className="account-avatar-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label={copy.avatar} tabIndex={-1} onChange={(event) => void uploadAvatar(event)} disabled={busy || !backend.isDesktop} />
          </div>

          {editingProfile ? <form className="account-profile-edit" onSubmit={(event) => void updateDisplayName(event)}>
            <p>{copy.displayNameHint}</p>
            <div className="account-avatar-actions">
              <button className="secondary-button" type="button" onClick={() => avatarInput.current?.click()} disabled={busy || !backend.isDesktop}><Icon name="download" size={16} />{copy.chooseImage}</button>
              {profile.avatarDataUrl ? <button className="small-button" type="button" onClick={() => void removeAvatar()} disabled={busy}><Icon name="trash" size={15} />{copy.removeAvatar}</button> : null}
            </div>
            <small>{copy.avatarHelp}</small>
            {busy ? <span role="status">{copy.saving}</span> : null}
            <div className="account-edit-actions">
              <button className="primary-button" type="submit" disabled={busy || !backend.isDesktop}>{busy ? copy.saving : copy.saveProfile}</button>
              <button className="small-button" type="button" disabled={busy} onClick={() => { setEditingProfile(false); setDisplayName(profile.displayName || ""); setError(""); setNotice(""); }}>{copy.close}</button>
            </div>
          </form> : null}

          <div className="account-profile-plan">
            <div><span>{copy.plan}</span><strong>{copy.freePlan}</strong></div>
            <div className="account-profile-plan-action"><button type="button" disabled title={copy.preparing}>{copy.seePlans}<span aria-hidden="true"> →</span></button><small>{copy.preparing}</small></div>
          </div>

          <nav className="account-profile-menu-links" aria-label={copy.profileSettings}>
            <button type="button" onClick={() => { setView("security"); setError(""); setNotice(""); }}><Icon name="lock" size={18} /><span>{copy.security}</span><Icon name="chevron" size={16} /></button>
            <button type="button" onClick={() => { setView("settings"); setError(""); setNotice(""); }}><Icon name="gear" size={18} /><span>{copy.accountSettings}</span><Icon name="chevron" size={16} /></button>
          </nav>

          {notice ? <p className="account-compact-notice" role="status">{notice}</p> : null}
          {error ? <p className="account-compact-error" role="alert">{error}</p> : null}
          <div className="account-profile-logout"><button type="button" onClick={() => void signOut()} disabled={busy}>{busy ? copy.loading : copy.signOut}</button></div>
        </div> : view === "checking" ? null : <>
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

            {view === "security" && profile ? <div className="account-subview">
              <button className="small-button account-back-button" type="button" onClick={() => { setView("profile"); setNotice(""); setError(""); }}><Icon name="back" size={16} />{copy.profileSettings}</button>
              <p>{copy.emailLabel}: <strong>{profile.email}</strong></p>
              <button className="account-setting-row" type="button" onClick={() => void (profile.hasPassword ? requestCurrentPasswordReset() : requestCurrentPasswordSetup())} disabled={busy || !backend.isDesktop}><Icon name="lock" size={18} /><span><strong>{profile.hasPassword ? copy.passwordChange : copy.enroll}</strong><small>{profile.hasPassword ? copy.resetSent : copy.passwordHint}</small></span><Icon name="chevron" size={16} /></button>
              <button className="account-setting-row is-preparing" type="button" disabled title={copy.preparing}><Icon name="users" size={18} /><span><strong>{copy.emailChange}</strong><small>{copy.preparing}</small></span><span>{copy.preparing}</span></button>
              <div className="account-setting-row is-active"><Icon name="lock" size={18} /><span><strong>{copy.twoFactor}</strong><small>{copy.emailCodeSignIn}</small></span><span>{copy.active}</span></div>
              <button className="account-setting-row is-preparing" type="button" disabled title={copy.preparing}><Icon name="user" size={18} /><span><strong>{copy.devices}</strong><small>{copy.otherDeviceLogout}</small></span><span>{copy.preparing}</span></button>
              <button className="account-setting-row is-preparing" type="button" disabled title={copy.preparing}><Icon name="trash" size={18} /><span><strong>{copy.deleteAccount}</strong><small>{copy.preparing}</small></span><span>{copy.preparing}</span></button>
              {notice ? <p className="compatibility good" role="status">{notice}</p> : null}
            </div> : null}

            {view === "settings" && profile ? <div className="account-subview">
              <button className="small-button account-back-button" type="button" onClick={() => { setView("profile"); setNotice(""); setError(""); }}><Icon name="back" size={16} />{copy.profileSettings}</button>
              <button className="account-setting-row is-preparing" type="button" disabled title={copy.preparing}><Icon name="check" size={18} /><span><strong>{copy.autoLogin}</strong><small>{copy.preparing}</small></span><span>{copy.preparing}</span></button>
              <button className="account-setting-row is-preparing" type="button" disabled title={copy.preparing}><Icon name="info" size={18} /><span><strong>{copy.dataCollection}</strong><small>{copy.preparing}</small></span><span>{copy.preparing}</span></button>
              <button className="account-setting-row is-preparing" type="button" disabled title={copy.preparing}><Icon name="info" size={18} /><span><strong>{copy.privacy}</strong><small>{copy.preparing}</small></span><span>{copy.preparing}</span></button>
            </div> : null}

            {error ? <p className="error-banner" role="alert"><Icon name="info" size={17} />{error}</p> : null}
          </div>
          <footer className="wizard-footer"><span>{view === "profile" ? copy.deviceLoginActive : ""}</span><button className="secondary-button" type="button" onClick={onClose}>{copy.close}</button></footer>
        </>}
      </section>
    </div>
  );
}
