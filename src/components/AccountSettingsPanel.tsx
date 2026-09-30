import { useState, type ChangeEvent, type FormEvent, type RefObject } from "react";
import type { AppLocale } from "../lib/i18n";
import { accountText } from "../lib/accountLocale";
import { accountSettingsText } from "../lib/accountSettingsLocale";
import type { AccountProfile } from "../lib/accountTypes";
import { Icon } from "./Icon";

export type AccountSettingsView = "profile" | "security" | "plan";

interface Props {
  locale: AppLocale;
  profile: AccountProfile;
  view: AccountSettingsView;
  displayName: string;
  busy: boolean;
  isDesktop: boolean;
  notice: string;
  error: string;
  avatarInput: RefObject<HTMLInputElement | null>;
  onViewChange: (view: AccountSettingsView) => void;
  onDisplayNameChange: (value: string) => void;
  onSaveDisplayName: (event: FormEvent<HTMLFormElement>) => void;
  onUploadAvatar: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
  onPasswordChange: () => void;
  onRequestEmailChange: (newEmail: string, currentPassword: string) => Promise<void>;
  onClearFeedback: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function AccountSettingsPanel({
  locale, profile, view, displayName, busy, isDesktop, notice, error, avatarInput,
  onViewChange, onDisplayNameChange, onSaveDisplayName, onUploadAvatar, onRemoveAvatar,
  onPasswordChange, onRequestEmailChange, onClearFeedback, onSignOut, onClose,
}: Props) {
  const copy = accountText(locale);
  const ui = accountSettingsText(locale);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [emailChangeTab, setEmailChangeTab] = useState<"profile" | "security">("profile");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const selectedTab = emailChangeOpen ? emailChangeTab : view;
  const displayLabel = profile.displayName || profile.email.split("@")[0];
  const createdDate = formatCreatedDate(profile.createdAt, locale);
  const tabs = [
    { id: "profile", label: ui.profileTab, icon: "user" },
    { id: "security", label: copy.security, icon: "lock" },
    { id: "plan", label: copy.plan, icon: "clock" },
  ] as const;

  return <>
    <header className="account-settings-header">
      <h2 id="account-dialog-title">{copy.accountSettings}</h2>
      <button className="icon-button" type="button" aria-label={copy.close} title={copy.close} onClick={onClose}><Icon name="close" size={19} /></button>
    </header>
    <nav className="account-settings-tabs" role="tablist" aria-label={copy.accountSettings}>
      {tabs.map((tab) => <button key={tab.id} id={`account-tab-${tab.id}`} role="tab" type="button"
        aria-selected={selectedTab === tab.id} aria-controls={`account-panel-${tab.id}`}
        onClick={() => {
          setEmailChangeOpen(false);
          setCurrentPassword("");
          setCopyNotice("");
          onClearFeedback();
          onViewChange(tab.id);
        }}><Icon name={tab.icon} size={19} />{tab.label}</button>)}
    </nav>
    <div className="account-settings-scroll" id={`account-panel-${selectedTab}`} role="tabpanel" aria-labelledby={`account-tab-${selectedTab}`}>
      {emailChangeOpen ? <section className="account-settings-email-change" aria-labelledby="account-email-change-title">
        <button className="small-button account-back-button" type="button" onClick={() => {
          setEmailChangeOpen(false);
          setCurrentPassword("");
          onClearFeedback();
        }}><Icon name="back" size={16} />{ui.emailChangeBack}</button>
        <h3 id="account-email-change-title">{copy.emailChange}</h3>
        {profile.hasPassword ? <>
          <p>{ui.emailChangeDescription}</p>
          <form className="account-settings-email-change-form" onSubmit={(event) => {
            event.preventDefault();
            const normalizedEmail = newEmail.trim();
            if (!normalizedEmail || !currentPassword) return;
            void onRequestEmailChange(normalizedEmail, currentPassword)
              .then(() => setNewEmail(""))
              .catch(() => undefined)
              .finally(() => setCurrentPassword(""));
          }}>
            <label><span>{ui.emailChangeNewEmail}</span><input type="email" autoComplete="email" required maxLength={254} value={newEmail} onChange={(event) => setNewEmail(event.target.value)} disabled={busy} /></label>
            <label><span>{ui.emailChangeCurrentPassword}</span><input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={busy} /></label>
            <div className="account-settings-email-change-actions">
              <button className="primary-button" type="submit" disabled={busy || !isDesktop}><Icon name="invite" size={16} />{busy ? copy.saving : ui.emailChangeSend}</button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => {
                setEmailChangeOpen(false);
                setCurrentPassword("");
                onClearFeedback();
              }}>{ui.emailChangeCancel}</button>
            </div>
          </form>
        </> : <div className="account-settings-email-change-password" role="note">
          <p>{ui.emailChangePasswordRequired}</p>
          <button className="primary-button" type="button" onClick={onPasswordChange} disabled={busy || !isDesktop}>{copy.enroll}</button>
        </div>}
      </section> : view === "profile" ? <>
        <section className="account-settings-hero" aria-label={ui.profileTab}>
          <div className="account-settings-avatar">{profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : <Icon name="user" size={52} />}</div>
          <div className="account-settings-hero-copy">
            <strong title={displayLabel}>{displayLabel}</strong>
            <span title={profile.email}>{profile.email}</span>
            <input ref={avatarInput} className="account-avatar-input" type="file" accept="image/*" aria-label={copy.avatar} tabIndex={-1} onChange={onUploadAvatar} disabled={busy || !isDesktop} />
            <div className="account-settings-avatar-actions">
              <button type="button" className="secondary-button" onClick={() => avatarInput.current?.click()} disabled={busy || !isDesktop}><Icon name="camera" size={17} />{copy.chooseImage}</button>
              {profile.avatarDataUrl ? <button type="button" className="small-button" onClick={onRemoveAvatar} disabled={busy || !isDesktop}><Icon name="trash" size={16} />{copy.removeAvatar}</button> : null}
            </div>
          </div>
        </section>
        <p className="account-settings-image-hint">{ui.imageHint}</p>
        <form id="account-profile-form" className="account-settings-profile-form" onSubmit={onSaveDisplayName}>
          <div className="account-settings-field">
            <div><strong>{copy.displayName}</strong><small>{copy.displayNameHint}</small></div>
            <label className="account-settings-value"><span className="sr-only">{copy.displayName}</span><input aria-label={copy.displayName} maxLength={32} value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} disabled={busy} /><Icon name="edit" size={17} /></label>
          </div>
          {profile.userId?.trim() ? <div className="account-settings-field">
            <div><strong>{ui.userId}</strong></div>
            <div className="account-settings-field-action">
              <span className="account-settings-value" title={profile.userId}>{profile.userId}</span>
              <button type="button" onClick={() => void navigator.clipboard.writeText(profile.userId!).then(() => setCopyNotice(ui.userIdCopied)).catch(() => setCopyNotice(ui.userIdCopyFailed))}><Icon name="clipboard" size={16} />{ui.copyUserId}</button>
            </div>
          </div> : null}
          <div className="account-settings-field">
            <div><strong>{copy.email}</strong><small>{copy.emailLabel}</small></div>
            <div className="account-settings-field-action"><span className="account-settings-value" title={profile.email}>{profile.email}</span><button type="button" disabled={busy || !isDesktop} onClick={() => {
              setEmailChangeTab("profile");
              setEmailChangeOpen(true);
              setNewEmail("");
              setCurrentPassword("");
              setCopyNotice("");
              onClearFeedback();
            }}><Icon name="edit" size={16} />{copy.emailChange}</button></div>
          </div>
          {createdDate ? <div className="account-settings-field">
            <div><strong>{ui.accountCreated}</strong></div>
            <span className="account-settings-value" title={new Date(profile.createdAt!).toISOString()}>{createdDate}</span>
          </div> : null}
        </form>
        {copyNotice ? <p className="account-settings-copy-status" role="status">{copyNotice}</p> : null}
      </> : null}

      {!emailChangeOpen && view === "security" ? <div className="account-settings-security">
        <div className="account-settings-security-row"><Icon name="lock" size={22} /><div><strong>{copy.password}</strong><small>{profile.hasPassword ? copy.passwordChange : copy.enroll}</small></div><button type="button" onClick={onPasswordChange} disabled={busy || !isDesktop}><Icon name="edit" size={16} />{copy.passwordChange}</button></div>
        <div className="account-settings-security-row"><Icon name="file" size={22} /><div><strong>{copy.email}</strong><small>{profile.email}</small></div><button type="button" onClick={() => {
          setEmailChangeTab("security");
          setEmailChangeOpen(true);
          setNewEmail("");
          setCurrentPassword("");
          onClearFeedback();
        }} disabled={busy || !isDesktop}><Icon name="edit" size={16} />{copy.emailChange}</button></div>
        <div className="account-settings-security-row"><Icon name="shield" size={22} /><div><strong>{copy.twoFactor}</strong><small>{profile.hasPassword ? copy.emailCodeSignIn : copy.preparing}</small></div><span className={`account-settings-active${profile.hasPassword ? "" : " is-pending"}`}><i />{profile.hasPassword ? copy.active : copy.preparing}</span></div>
        <div className="account-settings-security-row"><Icon name="trash" size={22} /><div><strong>{copy.deleteAccount}</strong><small>{copy.preparing}</small></div><button type="button" disabled>{copy.preparing}</button></div>
      </div> : null}

      {!emailChangeOpen && view === "plan" ? <div className="account-settings-plan">
        <h3><Icon name="check" size={21} />{ui.currentPlan}</h3>
        <section className="account-settings-current-plan">
          <span className="account-settings-plan-icon"><Icon name="user" size={36} /></span>
          <div><strong>{copy.freePlan}</strong><b>{ui.freePrice}</b><small>{ui.freeSummary}</small></div>
          <button type="button" onClick={() => document.getElementById("account-plan-comparison")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>{ui.comparePlans}<Icon name="chevron" size={16} /></button>
        </section>
        <h3 id="account-plan-comparison"><Icon name="lock" size={20} />{ui.comparePlans}</h3>
        <div className="account-settings-plan-grid">
          <section className="account-settings-plan-card is-current">
            <h4>{copy.freePlan}</h4><strong>{ui.freePrice}</strong>
            <ul>{ui.freeBenefits.map((benefit) => <li key={benefit}><Icon name="check" size={17} />{benefit}</li>)}</ul>
            <button type="button" disabled>{ui.currentPlanButton}</button>
          </section>
          <section className="account-settings-plan-card is-supporter">
            <h4>{ui.supporter}</h4><strong>{copy.preparing}</strong>
            <p>{ui.supporterPending}</p>
            <button type="button" disabled>{copy.seePlans} · {copy.preparing}</button>
          </section>
        </div>
      </div> : null}

      {notice ? <p className="compatibility good" role="status">{notice}</p> : null}
      {error ? <p className="error-banner" role="alert"><Icon name="info" size={17} />{error}</p> : null}
    </div>
    <footer className="account-settings-footer">
      {view === "profile" && !emailChangeOpen ? <button className="primary-button" type="submit" form="account-profile-form" disabled={busy || !isDesktop || !displayName.trim()}><Icon name="check" size={17} />{busy ? copy.saving : copy.saveProfile}</button> : null}
      {view === "security" && !emailChangeOpen ? <button className="secondary-button" type="button" onClick={onSignOut} disabled={busy}>{copy.signOut}</button> : null}
    </footer>
  </>;
}

function formatCreatedDate(createdAt: number | null | undefined, locale: AppLocale) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
