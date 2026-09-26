import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppLocale } from "../lib/i18n";
import { accountText } from "../lib/accountLocale";
import { backend } from "../lib/backend";
import type { AccountProfile } from "../lib/accountTypes";
import { Icon } from "./Icon";

interface Props {
  locale: AppLocale;
  onClose: () => void;
}

export function AccountDialog({ locale, onClose }: Props) {
  const copy = useMemo(() => accountText(locale), [locale]);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setProfile(await backend.accountLoadSession());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const requestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError(copy.enterEmail);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await backend.accountRequestCode(normalized);
      setSentTo(normalized);
      setEmail(normalized);
      setNotice(`${copy.codeSent} ${normalized}`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(copy.enterCode);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setProfile(await backend.accountVerifyCode(sentTo, code));
      setCode("");
      setNotice("");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await backend.accountLogout();
      setProfile(null);
      setSentTo("");
      setCode("");
      setNotice(copy.loggedOut);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="wizard account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <header className="wizard-header">
          <div><p className="wizard-kicker">TOMONODE</p><h2 id="account-dialog-title">{copy.title}</h2></div>
          <button className="icon-button" type="button" aria-label={copy.close} title={copy.close} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="wizard-body account-dialog-body">
          <p>{copy.intro}</p>
          {loading ? <p role="status">{copy.loading}</p> : null}
          {!backend.isDesktop ? <p className="info-callout"><Icon name="info" size={18} />{copy.windowsOnly}</p> : null}

          {!loading && profile ? <section className="account-status-card" aria-label={copy.signedIn}>
            <div><span className="section-kicker">{copy.signedIn}</span><strong>{profile.email}</strong></div>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void logout()}>{copy.signedOut}</button>
          </section> : null}

          {!loading && !profile ? <>
            {!sentTo ? <form className="form-stack account-form" onSubmit={(event) => void requestCode(event)}>
              <label><span>{copy.email}</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
              <button className="primary-button" type="submit" disabled={busy || !backend.isDesktop}><Icon name="invite" size={18} />{busy ? copy.loading : copy.sendCode}</button>
            </form> : <form className="form-stack account-form" onSubmit={(event) => void verifyCode(event)}>
              <p role="status">{notice || `${copy.codeSent} ${sentTo}`}</p>
              <label><span>{copy.code}</span><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} /></label>
              <button className="primary-button" type="submit" disabled={busy || !backend.isDesktop || code.length !== 6}>{busy ? copy.loading : copy.verifyCode}</button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => { setSentTo(""); setCode(""); setError(""); setNotice(""); }}>{copy.resend}</button>
            </form>}
            <p className="field-help">{copy.privacyNote}</p>
            {notice && !sentTo ? <p className="compatibility good" role="status"><Icon name="check" size={17} />{notice}</p> : null}
          </> : null}

          {error ? <p className="error-banner" role="alert"><Icon name="info" size={17} />{error}</p> : null}
        </div>
        <footer className="wizard-footer"><button className="secondary-button" type="button" onClick={onClose}>{copy.close}</button></footer>
      </section>
    </div>
  );
}
