import type { AppLocale } from "./i18n";

export interface AccountSidebarCopy {
  account: string;
  profileSettings: string;
  signedOutLabel: string;
  loginPrompt: string;
  loginCta: string;
  deviceLoginActive: string;
}

const catalogs: Record<AppLocale, AccountSidebarCopy> = {
  en: { account: "Account", profileSettings: "Profile settings", signedOutLabel: "Signed out", loginPrompt: "Sign in to your account", loginCta: "Sign in", deviceLoginActive: "Signed in on this device" },
  ja: { account: "アカウント", profileSettings: "プロフィール設定", signedOutLabel: "未ログイン", loginPrompt: "アカウントにログイン", loginCta: "ログイン", deviceLoginActive: "このデバイスでログイン中" },
  "zh-CN": { account: "账户", profileSettings: "个人资料设置", signedOutLabel: "未登录", loginPrompt: "登录账户", loginCta: "登录", deviceLoginActive: "已在此设备登录" },
  "zh-TW": { account: "帳戶", profileSettings: "個人資料設定", signedOutLabel: "未登入", loginPrompt: "登入帳戶", loginCta: "登入", deviceLoginActive: "已在此裝置登入" },
  ko: { account: "계정", profileSettings: "프로필 설정", signedOutLabel: "로그아웃됨", loginPrompt: "계정에 로그인", loginCta: "로그인", deviceLoginActive: "이 기기에서 로그인됨" },
  es: { account: "Cuenta", profileSettings: "Ajustes del perfil", signedOutLabel: "Sin iniciar sesión", loginPrompt: "Inicia sesión en tu cuenta", loginCta: "Iniciar sesión", deviceLoginActive: "Sesión iniciada en este dispositivo" },
  de: { account: "Konto", profileSettings: "Profileinstellungen", signedOutLabel: "Nicht angemeldet", loginPrompt: "Bei deinem Konto anmelden", loginCta: "Anmelden", deviceLoginActive: "Auf diesem Gerät angemeldet" },
  fr: { account: "Compte", profileSettings: "Paramètres du profil", signedOutLabel: "Non connecté", loginPrompt: "Connectez-vous à votre compte", loginCta: "Connexion", deviceLoginActive: "Connecté sur cet appareil" },
  "pt-BR": { account: "Conta", profileSettings: "Configurações do perfil", signedOutLabel: "Desconectado", loginPrompt: "Entre na sua conta", loginCta: "Entrar", deviceLoginActive: "Conectado neste dispositivo" },
};

export function accountSidebarText(locale: AppLocale): AccountSidebarCopy {
  return catalogs[locale];
}
