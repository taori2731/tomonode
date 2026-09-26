import type { AppLocale } from "./i18n";

export interface AccountCopy {
  account: string;
  title: string;
  intro: string;
  email: string;
  code: string;
  sendCode: string;
  verifyCode: string;
  resend: string;
  loading: string;
  close: string;
  loggedOut: string;
  signedIn: string;
  signedOut: string;
  windowsOnly: string;
  enterEmail: string;
  enterCode: string;
  codeSent: string;
  privacyNote: string;
}

const en: AccountCopy = {
  account: "Account", title: "TomoNode account", intro: "Sign in with a one-time code sent to your email.",
  email: "Email address", code: "6-digit verification code", sendCode: "Send code", verifyCode: "Verify and sign in",
  resend: "Change email / resend", loading: "Checking account…", close: "Close", loggedOut: "Signed out",
  signedIn: "Signed in as", signedOut: "Sign out", windowsOnly: "Account sign-in is currently available in the installed Windows app.",
  enterEmail: "Enter a valid email address.", enterCode: "Enter the 6-digit code from your email.",
  codeSent: "We sent a verification code to", privacyNote: "Your email is used for sign-in. The code expires after 10 minutes and the session after 30 days.",
};

const ja: AccountCopy = {
  account: "アカウント", title: "TomoNodeアカウント", intro: "メールで受け取る1回限りの確認コードでログインできます。",
  email: "メールアドレス", code: "6桁の確認コード", sendCode: "確認コードを送る", verifyCode: "確認してログイン",
  resend: "メールアドレス変更／再送", loading: "アカウントを確認しています…", close: "閉じる", loggedOut: "ログアウトしました",
  signedIn: "ログイン中", signedOut: "ログアウト", windowsOnly: "アカウントログインは現在、インストール版Windowsアプリで利用できます。",
  enterEmail: "有効なメールアドレスを入力してください。", enterCode: "メールで受け取った6桁の確認コードを入力してください。",
  codeSent: "確認コードを送りました：", privacyNote: "メールアドレスはログインに使用します。確認コードは10分、ログイン状態は30日で期限切れになります。",
};

const zhCN: AccountCopy = {
  account: "账户", title: "TomoNode账户", intro: "使用通过电子邮件发送的一次性验证码登录。",
  email: "电子邮件地址", code: "6位验证码", sendCode: "发送验证码", verifyCode: "验证并登录",
  resend: "更换邮箱／重新发送", loading: "正在检查账户…", close: "关闭", loggedOut: "已退出登录",
  signedIn: "已登录", signedOut: "退出登录", windowsOnly: "账户登录目前仅在已安装的 Windows 应用中提供。",
  enterEmail: "请输入有效的电子邮件地址。", enterCode: "请输入邮件中的6位验证码。",
  codeSent: "已发送验证码至", privacyNote: "电子邮件用于登录。验证码10分钟后过期，登录会话30天后过期。",
};

const zhTW: AccountCopy = {
  account: "帳戶", title: "TomoNode 帳戶", intro: "使用電子郵件的一次性驗證碼登入。",
  email: "電子郵件地址", code: "6 位數驗證碼", sendCode: "寄送驗證碼", verifyCode: "驗證並登入",
  resend: "更換電子郵件／重新寄送", loading: "正在檢查帳戶…", close: "關閉", loggedOut: "已登出",
  signedIn: "已登入", signedOut: "登出", windowsOnly: "帳戶登入目前僅適用於已安裝的 Windows 應用程式。",
  enterEmail: "請輸入有效的電子郵件地址。", enterCode: "請輸入電子郵件中的 6 位數驗證碼。",
  codeSent: "已寄送驗證碼至", privacyNote: "電子郵件用於登入。驗證碼 10 分鐘後失效，登入工作階段 30 天後失效。",
};

const ko: AccountCopy = {
  account: "계정", title: "TomoNode 계정", intro: "이메일로 받은 일회용 코드로 로그인하세요.",
  email: "이메일 주소", code: "6자리 인증 코드", sendCode: "코드 보내기", verifyCode: "확인하고 로그인",
  resend: "이메일 변경 / 다시 보내기", loading: "계정을 확인하는 중…", close: "닫기", loggedOut: "로그아웃됨",
  signedIn: "로그인됨", signedOut: "로그아웃", windowsOnly: "계정 로그인은 현재 설치된 Windows 앱에서 사용할 수 있습니다.",
  enterEmail: "올바른 이메일 주소를 입력하세요.", enterCode: "이메일로 받은 6자리 코드를 입력하세요.",
  codeSent: "인증 코드를 다음 주소로 보냈습니다:", privacyNote: "이메일은 로그인에 사용됩니다. 코드는 10분, 로그인 세션은 30일 후 만료됩니다.",
};

const es: AccountCopy = {
  account: "Cuenta", title: "Cuenta de TomoNode", intro: "Inicia sesión con un código de un solo uso enviado por correo.",
  email: "Correo electrónico", code: "Código de verificación de 6 dígitos", sendCode: "Enviar código", verifyCode: "Verificar e iniciar sesión",
  resend: "Cambiar correo / reenviar", loading: "Comprobando cuenta…", close: "Cerrar", loggedOut: "Sesión cerrada",
  signedIn: "Sesión iniciada como", signedOut: "Cerrar sesión", windowsOnly: "El inicio de sesión está disponible actualmente en la aplicación de Windows instalada.",
  enterEmail: "Introduce un correo válido.", enterCode: "Introduce el código de 6 dígitos del correo.",
  codeSent: "Enviamos un código de verificación a", privacyNote: "El correo se usa para iniciar sesión. El código caduca en 10 minutos y la sesión en 30 días.",
};

const de: AccountCopy = {
  account: "Konto", title: "TomoNode-Konto", intro: "Melde dich mit einem einmaligen E-Mail-Code an.",
  email: "E-Mail-Adresse", code: "6-stelliger Bestätigungscode", sendCode: "Code senden", verifyCode: "Bestätigen und anmelden",
  resend: "E-Mail ändern / erneut senden", loading: "Konto wird geprüft…", close: "Schließen", loggedOut: "Abgemeldet",
  signedIn: "Angemeldet als", signedOut: "Abmelden", windowsOnly: "Die Kontoanmeldung ist derzeit in der installierten Windows-App verfügbar.",
  enterEmail: "Gib eine gültige E-Mail-Adresse ein.", enterCode: "Gib den 6-stelligen Code aus deiner E-Mail ein.",
  codeSent: "Wir haben einen Bestätigungscode gesendet an", privacyNote: "Die E-Mail wird zur Anmeldung verwendet. Der Code läuft nach 10 Minuten, die Sitzung nach 30 Tagen ab.",
};

const fr: AccountCopy = {
  account: "Compte", title: "Compte TomoNode", intro: "Connectez-vous avec un code à usage unique envoyé par e-mail.",
  email: "Adresse e-mail", code: "Code de vérification à 6 chiffres", sendCode: "Envoyer le code", verifyCode: "Vérifier et se connecter",
  resend: "Changer d’adresse / renvoyer", loading: "Vérification du compte…", close: "Fermer", loggedOut: "Déconnecté",
  signedIn: "Connecté en tant que", signedOut: "Se déconnecter", windowsOnly: "La connexion est actuellement disponible dans l’application Windows installée.",
  enterEmail: "Saisissez une adresse e-mail valide.", enterCode: "Saisissez le code à 6 chiffres reçu par e-mail.",
  codeSent: "Nous avons envoyé un code de vérification à", privacyNote: "L’e-mail sert à la connexion. Le code expire après 10 minutes et la session après 30 jours.",
};

const ptBR: AccountCopy = {
  account: "Conta", title: "Conta TomoNode", intro: "Entre com um código único enviado por e-mail.",
  email: "Endereço de e-mail", code: "Código de verificação de 6 dígitos", sendCode: "Enviar código", verifyCode: "Verificar e entrar",
  resend: "Trocar e-mail / reenviar", loading: "Verificando conta…", close: "Fechar", loggedOut: "Você saiu",
  signedIn: "Conectado como", signedOut: "Sair", windowsOnly: "O login da conta está disponível atualmente no aplicativo Windows instalado.",
  enterEmail: "Digite um endereço de e-mail válido.", enterCode: "Digite o código de 6 dígitos recebido por e-mail.",
  codeSent: "Enviamos um código de verificação para", privacyNote: "O e-mail é usado para login. O código expira em 10 minutos e a sessão em 30 dias.",
};

const catalogs: Record<AppLocale, AccountCopy> = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, ko, es, de, fr, "pt-BR": ptBR };

export function accountText(locale: AppLocale): AccountCopy {
  return catalogs[locale];
}
