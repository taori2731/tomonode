import type { ChangeEvent, FormEvent, RefObject } from "react";
import type { AppLocale } from "../lib/i18n";
import { accountText } from "../lib/accountLocale";
import { accountSettingsText } from "../lib/accountSettingsLocale";
import type { AccountProfile } from "../lib/accountTypes";
import { Icon } from "./Icon";

export type AccountSettingsView = "profile" | "security" | "plan" | "settings";

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
  onSignOut: () => void;
  onClose: () => void;
}

export function AccountSettingsPanel({
  locale, profile, view, displayName, busy, isDesktop, notice, error, avatarInput,
  onViewChange, onDisplayNameChange, onSaveDisplayName, onUploadAvatar, onRemoveAvatar,
  onPasswordChange, onSignOut, onClose,
}: Props) {
  const copy = accountText(locale);
  const ui = accountSettingsText(locale);
  const selectedTab = view === "settings" ? "profile" : view;
  const displayLabel = profile.displayName || profile.email.split("@")[0];
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
        onClick={() => onViewChange(tab.id)}><Icon name={tab.icon} size={19} />{tab.label}</button>)}
    </nav>
    <div className="account-settings-scroll" id={`account-panel-${selectedTab}`} role="tabpanel" aria-labelledby={`account-tab-${selectedTab}`}>
      {view === "profile" ? <>
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
          <div className="account-settings-field">
            <div><strong>{ui.userId}</strong><small>{copy.preparing}</small></div>
            <span className="account-settings-value is-unavailable">{copy.preparing}</span>
          </div>
          <div className="account-settings-field">
            <div><strong>{copy.email}</strong><small>{copy.emailLabel}</small></div>
            <div className="account-settings-field-action"><span className="account-settings-value" title={profile.email}>{profile.email}</span><button type="button" disabled title={copy.preparing}><Icon name="edit" size={16} />{copy.emailChange}</button></div>
          </div>
          <div className="account-settings-field">
            <div><strong>{ui.accountCreated}</strong><small>{copy.preparing}</small></div>
            <span className="account-settings-value is-unavailable">{copy.preparing}</span>
          </div>
        </form>
        <button className="account-settings-extra-link" type="button" onClick={() => onViewChange("settings")}><Icon name="gear" size={17} />{copy.accountSettings}<Icon name="chevron" size={16} /></button>
      </> : null}

      {view === "security" ? <div className="account-settings-security">
        <div className="account-settings-security-row"><Icon name="lock" size={22} /><div><strong>{copy.password}</strong><small>{profile.hasPassword ? copy.passwordChange : copy.enroll}</small></div><button type="button" onClick={onPasswordChange} disabled={busy || !isDesktop}><Icon name="edit" size={16} />{copy.passwordChange}</button></div>
        <div className="account-settings-security-row"><Icon name="file" size={22} /><div><strong>{copy.email}</strong><small>{profile.email}</small></div><button type="button" disabled title={copy.preparing}>{copy.emailChange} · {copy.preparing}</button></div>
        <div className="account-settings-security-row"><Icon name="shield" size={22} /><div><strong>{copy.twoFactor}</strong><small>{profile.hasPassword ? copy.emailCodeSignIn : copy.preparing}</small></div><span className={`account-settings-active${profile.hasPassword ? "" : " is-pending"}`}><i />{profile.hasPassword ? copy.active : copy.preparing}</span></div>
        <section className="account-settings-devices">
          <h3>{copy.devices}</h3><p>{ui.devicesPending}</p>
          <div className="account-settings-security-row"><Icon name="memory" size={22} /><div><strong>{ui.currentDevice}</strong><small>{copy.deviceLoginActive}</small></div><span className="account-settings-active">{ui.currentDevice}</span></div>
          <button type="button" className="account-settings-danger" disabled title={copy.preparing}><Icon name="lock" size={17} />{copy.otherDeviceLogout} · {copy.preparing}</button>
          <button type="button" className="account-settings-delete" disabled title={copy.preparing}>{copy.deleteAccount} · {copy.preparing}</button>
        </section>
      </div> : null}

      {view === "plan" ? <div className="account-settings-plan">
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

      {view === "settings" ? <div className="account-settings-other">
        <button className="small-button account-back-button" type="button" onClick={() => onViewChange("profile")}><Icon name="back" size={16} />{ui.profileTab}</button>
        <h3>{copy.accountSettings}</h3>
        {[copy.autoLogin, copy.dataCollection, copy.privacy].map((label) => <div className="account-settings-security-row is-unavailable" key={label}><Icon name="gear" size={20} /><div><strong>{label}</strong><small>{copy.preparing}</small></div></div>)}
      </div> : null}

      {notice ? <p className="compatibility good" role="status">{notice}</p> : null}
      {error ? <p className="error-banner" role="alert"><Icon name="info" size={17} />{error}</p> : null}
    </div>
    <footer className="account-settings-footer">
      {view === "profile" ? <button className="primary-button" type="submit" form="account-profile-form" disabled={busy || !isDesktop || !displayName.trim()}><Icon name="check" size={17} />{busy ? copy.saving : copy.saveProfile}</button> : null}
      {view === "security" ? <button className="secondary-button" type="button" onClick={onSignOut} disabled={busy}>{copy.signOut}</button> : null}
    </footer>
  </>;
}
