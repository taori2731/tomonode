import type { AppLocale } from "./i18n";

const copies: Record<AppLocale, { discordNav: string; discordConfigure: string; backToPlan: string }> = {
  ja: { discordNav: "Discord運営通知", discordConfigure: "Discord運営通知を設定", backToPlan: "プランに戻る" },
  en: { discordNav: "Discord notifications", discordConfigure: "Configure Discord notifications", backToPlan: "Back to plan" },
  "zh-CN": { discordNav: "Discord 运营通知", discordConfigure: "配置 Discord 通知", backToPlan: "返回方案" },
  "zh-TW": { discordNav: "Discord 管理通知", discordConfigure: "設定 Discord 通知", backToPlan: "返回方案" },
  ko: { discordNav: "Discord 운영 알림", discordConfigure: "Discord 알림 설정", backToPlan: "요금제로 돌아가기" },
  es: { discordNav: "Notificaciones de Discord", discordConfigure: "Configurar notificaciones de Discord", backToPlan: "Volver al plan" },
  de: { discordNav: "Discord-Benachrichtigungen", discordConfigure: "Discord-Benachrichtigungen einrichten", backToPlan: "Zurück zum Tarif" },
  fr: { discordNav: "Notifications Discord", discordConfigure: "Configurer les notifications Discord", backToPlan: "Retour à l’offre" },
  "pt-BR": { discordNav: "Notificações do Discord", discordConfigure: "Configurar notificações do Discord", backToPlan: "Voltar ao plano" },
};

export type SettingsPanelKey = keyof typeof copies.ja;
export function settingsPanelText(locale: AppLocale, key: SettingsPanelKey) {
  return copies[locale][key];
}
export function allSettingsPanelLocalesHaveCompleteMessages() {
  const keys = Object.keys(copies.ja).sort().join("|");
  return Object.values(copies).every((copy) => Object.keys(copy).sort().join("|") === keys && Object.values(copy).every(Boolean));
}
