import type { AppLocale } from "./i18n";

export interface AccountCopy {
  account: string;
  title: string;
  intro: string;
  browserAuthIntro: string;
  browserAuthLogin: string;
  browserAuthRegister: string;
  browserAuthStarting: string;
  browserAuthWaiting: string;
  browserAuthCode: string;
  browserAuthExpiresIn: string;
  browserAuthReopen: string;
  browserAuthCancel: string;
  browserAuthRetry: string;
  browserAuthExpired: string;
  browserAuthFailed: string;
  browserAuthOpenFailed: string;
  browserAuthSignedIn: string;
  email: string;
  password: string;
  confirmPassword: string;
  code: string;
  login: string;
  enroll: string;
  forgotPassword: string;
  backToLogin: string;
  sendCode: string;
  verifyCode: string;
  resend: string;
  continue: string;
  setPassword: string;
  passwordEnrolled: string;
  requestReset: string;
  passwordHint: string;
  passwordMismatch: string;
  passwordInvalid: string;
  loading: string;
  close: string;
  loggedOut: string;
  signedIn: string;
  signOut: string;
  windowsOnly: string;
  enterEmail: string;
  enterCode: string;
  codeSent: string;
  enrollmentSent: string;
  resetSent: string;
  privacyNote: string;
  displayName: string;
  displayNameHint: string;
  saveProfile: string;
  edit: string;
  profileSettings: string;
  avatar: string;
  chooseImage: string;
  removeAvatar: string;
  avatarHelp: string;
  avatarSizeError: string;
  avatarTypeError: string;
  saving: string;
  profileSaved: string;
  signedOutLabel: string;
  loginPrompt: string;
  loginCta: string;
  deviceLoginActive: string;
  emailLabel: string;
  plan: string;
  freePlan: string;
  planDescription: string;
  seePlans: string;
  security: string;
  accountSettings: string;
  passwordChange: string;
  emailChange: string;
  twoFactor: string;
  devices: string;
  otherDeviceLogout: string;
  deleteAccount: string;
  autoLogin: string;
  dataCollection: string;
  privacy: string;
  emailCodeSignIn: string;
  active: string;
  preparing: string;
}

const en: AccountCopy = {
  account: "Account", title: "Profile settings", intro: "Sign in with your email and password. We will send a verification code to your email.",
  browserAuthIntro: "Sign in or create an account securely in your browser.", browserAuthLogin: "Sign in in browser", browserAuthRegister: "Create a new account",
  browserAuthStarting: "Preparing a secure sign-in…", browserAuthWaiting: "Check that the code shown in the browser matches, then approve this sign-in.", browserAuthCode: "App pairing code", browserAuthExpiresIn: "Expires in", browserAuthReopen: "Reopen browser", browserAuthCancel: "Cancel sign-in", browserAuthRetry: "Try again", browserAuthExpired: "This code expired. Start again to get a new code.", browserAuthFailed: "We couldn't verify the sign-in. Retry or reopen the browser.", browserAuthOpenFailed: "The browser could not be opened. Try reopening it.", browserAuthSignedIn: "Signed in successfully.",
  email: "Email address", password: "Password", confirmPassword: "Confirm password", code: "6-digit verification code",
  login: "Sign in", enroll: "Set up a password", forgotPassword: "Forgot password?", backToLogin: "Back to sign in",
  sendCode: "Send code", verifyCode: "Verify and sign in", resend: "Change email / resend", continue: "Continue",
  setPassword: "Create account", passwordEnrolled: "Password set. Sign in with your email and password.", requestReset: "Send reset link", passwordHint: "Use 6–128 characters. No character mix is required.",
  passwordMismatch: "The passwords do not match.", passwordInvalid: "Use 6–128 characters (up to 512 UTF-8 bytes).",
  loading: "Checking account…", close: "Close", loggedOut: "Signed out", signedIn: "Signed in",
  signOut: "Sign out", windowsOnly: "Account features are available in the installed Windows app.",
  enterEmail: "Enter a valid email address.", enterCode: "Enter the 6-digit code from your email.",
  codeSent: "We sent a sign-in code to", enrollmentSent: "We sent an account setup code to", resetSent: "If the address is registered, a password reset link will arrive shortly.",
  privacyNote: "Your email is used for sign-in. The verification code expires after 10 minutes.",
  displayName: "Display name", displayNameHint: "This name is shown in TomoNode. It does not change your sign-in email.",
  saveProfile: "Save changes", edit: "Edit", profileSettings: "Profile settings", avatar: "Profile image", chooseImage: "Upload image", removeAvatar: "Remove image",
  avatarHelp: "Choose an image up to 20 MB; it is compressed before syncing.", avatarSizeError: "Choose an image no larger than 20 MB.",
  avatarTypeError: "Choose a PNG, JPEG, or WebP image.", saving: "Saving…", profileSaved: "Profile updated",
  signedOutLabel: "Not signed in", loginPrompt: "Sign in to your account", loginCta: "Sign in", deviceLoginActive: "Signed in on this device",
  emailLabel: "Email", plan: "Plan", freePlan: "Free Plan", planDescription: "Core server management features", seePlans: "Explore plans",
  security: "Security", accountSettings: "Account settings", passwordChange: "Change password", emailChange: "Change email",
  twoFactor: "Two-step verification", devices: "Signed-in devices", otherDeviceLogout: "Sign out other devices", deleteAccount: "Delete account",
  autoLogin: "Automatic sign-in", dataCollection: "Optional usage data", privacy: "Privacy information", emailCodeSignIn: "An email code is required after your password", active: "Active", preparing: "Coming soon",
};

const ja: AccountCopy = {
  account: "アカウント", title: "プロフィール設定", intro: "メールアドレスとパスワードでログインします。確認コードをメールに送ります。",
  browserAuthIntro: "ログインとアカウント登録はブラウザで安全に行います。", browserAuthLogin: "ブラウザでログイン", browserAuthRegister: "新しいアカウントを作成",
  browserAuthStarting: "安全なログインを準備しています…", browserAuthWaiting: "ブラウザに表示されたコードが一致することを確認し、ログインを承認してください。", browserAuthCode: "アプリ連携コード", browserAuthExpiresIn: "有効期限", browserAuthReopen: "ブラウザを再度開く", browserAuthCancel: "ログインをキャンセル", browserAuthRetry: "再試行", browserAuthExpired: "コードの有効期限が切れました。新しいコードでやり直してください。", browserAuthFailed: "ログインを確認できませんでした。再試行するか、ブラウザを開き直してください。", browserAuthOpenFailed: "ブラウザを開けませんでした。もう一度お試しください。", browserAuthSignedIn: "ログインしました。",
  email: "メールアドレス", password: "パスワード", confirmPassword: "パスワード（確認）", code: "6桁の確認コード",
  login: "ログイン", enroll: "パスワードを設定", forgotPassword: "パスワードを忘れた場合", backToLogin: "ログインに戻る",
  sendCode: "確認コードを送る", verifyCode: "確認してログイン", resend: "メールアドレス変更／再送", continue: "次へ",
  setPassword: "アカウントを登録", passwordEnrolled: "パスワードを設定しました。メールアドレスとパスワードでログインしてください。", requestReset: "再設定リンクを送る", passwordHint: "6〜128文字。文字種の組み合わせ指定はありません。",
  passwordMismatch: "パスワードが一致しません。", passwordInvalid: "6〜128文字（UTF-8で512バイト以下）で入力してください。",
  loading: "アカウントを確認しています…", close: "閉じる", loggedOut: "ログアウトしました", signedIn: "ログイン中",
  signOut: "ログアウト", windowsOnly: "アカウント機能はインストール版Windowsアプリで利用できます。",
  enterEmail: "有効なメールアドレスを入力してください。", enterCode: "メールで受け取った6桁の確認コードを入力してください。",
  codeSent: "ログイン確認コードを送りました：", enrollmentSent: "登録用の確認コードを送りました：", resetSent: "登録済みのメールアドレスなら、パスワード再設定リンクが届きます。",
  privacyNote: "メールアドレスはログインに使用します。確認コードは10分で期限切れになります。",
  displayName: "表示名", displayNameHint: "TomoNode内で表示する名前です。ログイン用メールアドレスは変わりません。",
  saveProfile: "変更を保存", edit: "編集", profileSettings: "プロフィール設定", avatar: "プロフィール画像", chooseImage: "画像をアップロード", removeAvatar: "画像を削除",
  avatarHelp: "20 MBまでの画像を選べます。圧縮して端末間で同期します。", avatarSizeError: "20 MB以下の画像を選んでください。",
  avatarTypeError: "PNG・JPEG・WebPの画像を選んでください。", saving: "保存中…", profileSaved: "プロフィールを更新しました",
  signedOutLabel: "ログインしていません", loginPrompt: "アカウントにログイン", loginCta: "ログイン", deviceLoginActive: "この端末でログイン中",
  emailLabel: "メールアドレス", plan: "プラン", freePlan: "Free Plan", planDescription: "サーバー管理の基本機能", seePlans: "プランを見る",
  security: "セキュリティ", accountSettings: "アカウント設定", passwordChange: "パスワードを変更", emailChange: "メールアドレスを変更",
  twoFactor: "2段階認証", devices: "ログイン中の端末", otherDeviceLogout: "他の端末からログアウト", deleteAccount: "アカウントを削除",
  autoLogin: "自動ログイン", dataCollection: "任意の利用データ送信", privacy: "プライバシー情報", emailCodeSignIn: "パスワードの後にメールの認証コードで確認します", active: "有効", preparing: "準備中",
};

const zhCN: AccountCopy = {
  account: "账户", title: "个人资料设置", intro: "使用电子邮件和密码登录。我们会向你的邮箱发送验证码。",
  browserAuthIntro: "请在浏览器中安全地登录或创建账户。", browserAuthLogin: "在浏览器中登录", browserAuthRegister: "创建新账户",
  browserAuthStarting: "正在准备安全登录…", browserAuthWaiting: "请确认浏览器中显示的代码一致，然后批准登录。", browserAuthCode: "设备配对码", browserAuthExpiresIn: "有效期", browserAuthReopen: "重新打开浏览器", browserAuthCancel: "取消登录", browserAuthRetry: "重试", browserAuthExpired: "此代码已过期。请重新开始以获取新代码。", browserAuthFailed: "无法确认登录。请重试或重新打开浏览器。", browserAuthOpenFailed: "无法打开浏览器，请重试。", browserAuthSignedIn: "登录成功。",
  email: "电子邮件地址", password: "密码", confirmPassword: "确认密码", code: "6位验证码",
  login: "登录", enroll: "设置密码", forgotPassword: "忘记密码？", backToLogin: "返回登录",
  sendCode: "发送验证码", verifyCode: "验证并登录", resend: "更换邮箱／重新发送", continue: "继续",
  setPassword: "创建账户", passwordEnrolled: "密码已设置。请使用电子邮件和密码登录。", requestReset: "发送重置链接", passwordHint: "使用6–128个字符，无需组合特定字符类型。",
  passwordMismatch: "两次输入的密码不一致。", passwordInvalid: "请输入6–128个字符（UTF-8不超过512字节）。",
  loading: "正在检查账户…", close: "关闭", loggedOut: "已退出登录", signedIn: "已登录",
  signOut: "退出登录", windowsOnly: "账户功能目前可在已安装的 Windows 应用中使用。",
  enterEmail: "请输入有效的电子邮件地址。", enterCode: "请输入邮件中的6位验证码。",
  codeSent: "登录验证码已发送至", enrollmentSent: "账户设置验证码已发送至", resetSent: "如果该邮箱已注册，密码重置链接很快会发送到该地址。",
  privacyNote: "电子邮件用于登录。验证码10分钟后过期。", displayName: "显示名称", displayNameHint: "此名称会显示在 TomoNode 中，不会更改登录邮箱。",
  saveProfile: "保存更改", edit: "编辑", profileSettings: "个人资料设置", avatar: "个人头像", chooseImage: "上传图片", removeAvatar: "移除图片",
  avatarHelp: "可选择最大20 MB的图片；压缩后同步。", avatarSizeError: "请选择不超过20 MB的图片。",
  avatarTypeError: "请选择PNG、JPEG或WebP图片。", saving: "正在保存…", profileSaved: "个人资料已更新",
  signedOutLabel: "未登录", loginPrompt: "登录账户", loginCta: "登录", deviceLoginActive: "此设备已登录",
  emailLabel: "电子邮件", plan: "方案", freePlan: "Free Plan", planDescription: "服务器管理基础功能", seePlans: "查看方案",
  security: "安全", accountSettings: "账户设置", passwordChange: "更改密码", emailChange: "更改电子邮件",
  twoFactor: "两步验证", devices: "已登录设备", otherDeviceLogout: "退出其他设备", deleteAccount: "删除账户",
  autoLogin: "自动登录", dataCollection: "可选使用数据", privacy: "隐私信息", emailCodeSignIn: "密码登录后需要通过电子邮件验证码确认", active: "已启用", preparing: "准备中",
};

const zhTW: AccountCopy = {
  account: "帳戶", title: "個人資料設定", intro: "使用電子郵件和密碼登入。我們會寄送驗證碼到你的信箱。",
  browserAuthIntro: "請在瀏覽器中安全地登入或建立帳戶。", browserAuthLogin: "在瀏覽器中登入", browserAuthRegister: "建立新帳戶",
  browserAuthStarting: "正在準備安全登入…", browserAuthWaiting: "請確認瀏覽器顯示的代碼一致，再核准登入。", browserAuthCode: "裝置配對碼", browserAuthExpiresIn: "有效期限", browserAuthReopen: "重新開啟瀏覽器", browserAuthCancel: "取消登入", browserAuthRetry: "重試", browserAuthExpired: "此代碼已過期。請重新開始以取得新代碼。", browserAuthFailed: "無法確認登入。請重試或重新開啟瀏覽器。", browserAuthOpenFailed: "無法開啟瀏覽器，請重試。", browserAuthSignedIn: "登入成功。",
  email: "電子郵件地址", password: "密碼", confirmPassword: "確認密碼", code: "6 位數驗證碼",
  login: "登入", enroll: "設定密碼", forgotPassword: "忘記密碼？", backToLogin: "返回登入",
  sendCode: "寄送驗證碼", verifyCode: "驗證並登入", resend: "更換電子郵件／重新寄送", continue: "繼續",
  setPassword: "建立帳戶", passwordEnrolled: "密碼已設定。請使用電子郵件和密碼登入。", requestReset: "寄送重設連結", passwordHint: "使用 6–128 個字元，不需要混合特定字元類型。",
  passwordMismatch: "兩次輸入的密碼不一致。", passwordInvalid: "請輸入 6–128 個字元（UTF-8 不超過 512 位元組）。",
  loading: "正在檢查帳戶…", close: "關閉", loggedOut: "已登出", signedIn: "已登入",
  signOut: "登出", windowsOnly: "帳戶功能目前可在已安裝的 Windows 應用程式中使用。",
  enterEmail: "請輸入有效的電子郵件地址。", enterCode: "請輸入電子郵件中的 6 位數驗證碼。",
  codeSent: "登入驗證碼已寄送至", enrollmentSent: "帳戶設定驗證碼已寄送至", resetSent: "如果此信箱已註冊，密碼重設連結很快會寄到該地址。",
  privacyNote: "電子郵件用於登入。驗證碼 10 分鐘後失效。", displayName: "顯示名稱", displayNameHint: "此名稱會顯示在 TomoNode 中，不會變更登入電子郵件。",
  saveProfile: "儲存變更", edit: "編輯", profileSettings: "個人資料設定", avatar: "個人頭像", chooseImage: "上傳圖片", removeAvatar: "移除圖片",
  avatarHelp: "可選擇最大20 MB的圖片；壓縮後同步。", avatarSizeError: "請選擇不超過20 MB的圖片。",
  avatarTypeError: "請選擇 PNG、JPEG 或 WebP 圖片。", saving: "正在儲存…", profileSaved: "個人資料已更新",
  signedOutLabel: "尚未登入", loginPrompt: "登入帳戶", loginCta: "登入", deviceLoginActive: "此裝置已登入",
  emailLabel: "電子郵件", plan: "方案", freePlan: "Free Plan", planDescription: "伺服器管理基本功能", seePlans: "查看方案",
  security: "安全性", accountSettings: "帳戶設定", passwordChange: "變更密碼", emailChange: "變更電子郵件",
  twoFactor: "兩步驟驗證", devices: "已登入裝置", otherDeviceLogout: "登出其他裝置", deleteAccount: "刪除帳戶",
  autoLogin: "自動登入", dataCollection: "選用使用資料", privacy: "隱私資訊", emailCodeSignIn: "密碼登入後需要透過電子郵件驗證碼確認", active: "已啟用", preparing: "準備中",
};

const ko: AccountCopy = {
  account: "계정", title: "프로필 설정", intro: "이메일과 비밀번호로 로그인합니다. 이메일로 인증 코드를 보냅니다.",
  browserAuthIntro: "브라우저에서 안전하게 로그인하거나 계정을 만드세요.", browserAuthLogin: "브라우저에서 로그인", browserAuthRegister: "새 계정 만들기",
  browserAuthStarting: "안전한 로그인을 준비하는 중…", browserAuthWaiting: "브라우저에 표시된 코드가 일치하는지 확인한 뒤 로그인을 승인하세요.", browserAuthCode: "기기 연결 코드", browserAuthExpiresIn: "만료 시간", browserAuthReopen: "브라우저 다시 열기", browserAuthCancel: "로그인 취소", browserAuthRetry: "다시 시도", browserAuthExpired: "코드가 만료되었습니다. 새 코드를 받으려면 다시 시작하세요.", browserAuthFailed: "로그인을 확인하지 못했습니다. 다시 시도하거나 브라우저를 다시 여세요.", browserAuthOpenFailed: "브라우저를 열지 못했습니다. 다시 시도하세요.", browserAuthSignedIn: "로그인했습니다.",
  email: "이메일 주소", password: "비밀번호", confirmPassword: "비밀번호 확인", code: "6자리 인증 코드",
  login: "로그인", enroll: "비밀번호 설정", forgotPassword: "비밀번호를 잊으셨나요?", backToLogin: "로그인으로 돌아가기",
  sendCode: "인증 코드 보내기", verifyCode: "확인하고 로그인", resend: "이메일 변경 / 다시 보내기", continue: "계속",
  setPassword: "계정 만들기", passwordEnrolled: "비밀번호를 설정했습니다. 이메일과 비밀번호로 로그인하세요.", requestReset: "재설정 링크 보내기", passwordHint: "6~128자이며 특정 문자 조합은 필요하지 않습니다.",
  passwordMismatch: "비밀번호가 일치하지 않습니다.", passwordInvalid: "6~128자(UTF-8 512바이트 이하)를 입력하세요.",
  loading: "계정을 확인하는 중…", close: "닫기", loggedOut: "로그아웃됨", signedIn: "로그인됨",
  signOut: "로그아웃", windowsOnly: "계정 기능은 설치된 Windows 앱에서 사용할 수 있습니다.",
  enterEmail: "올바른 이메일 주소를 입력하세요.", enterCode: "이메일로 받은 6자리 코드를 입력하세요.",
  codeSent: "로그인 인증 코드를 보냈습니다:", enrollmentSent: "계정 설정 코드를 보냈습니다:", resetSent: "등록된 주소라면 비밀번호 재설정 링크가 곧 도착합니다.",
  privacyNote: "이메일은 로그인에 사용됩니다. 인증 코드는 10분 후 만료됩니다.", displayName: "표시 이름", displayNameHint: "TomoNode에 표시되는 이름입니다. 로그인 이메일은 변경되지 않습니다.",
  saveProfile: "변경 사항 저장", edit: "수정", profileSettings: "프로필 설정", avatar: "프로필 이미지", chooseImage: "이미지 업로드", removeAvatar: "이미지 삭제",
  avatarHelp: "20 MB 이하 이미지를 선택하세요. 압축하여 동기화합니다.", avatarSizeError: "20 MB 이하의 이미지를 선택하세요.",
  avatarTypeError: "PNG, JPEG 또는 WebP 이미지를 선택하세요.", saving: "저장 중…", profileSaved: "프로필을 업데이트했습니다",
  signedOutLabel: "로그인하지 않음", loginPrompt: "계정에 로그인", loginCta: "로그인", deviceLoginActive: "이 기기에서 로그인됨",
  emailLabel: "이메일", plan: "요금제", freePlan: "Free Plan", planDescription: "서버 관리 기본 기능", seePlans: "요금제 보기",
  security: "보안", accountSettings: "계정 설정", passwordChange: "비밀번호 변경", emailChange: "이메일 변경",
  twoFactor: "2단계 인증", devices: "로그인된 기기", otherDeviceLogout: "다른 기기에서 로그아웃", deleteAccount: "계정 삭제",
  autoLogin: "자동 로그인", dataCollection: "선택적 사용 데이터", privacy: "개인정보 안내", emailCodeSignIn: "비밀번호 로그인 후 이메일 인증 코드가 필요합니다", active: "사용 중", preparing: "준비 중",
};

const es: AccountCopy = {
  account: "Cuenta", title: "Ajustes del perfil", intro: "Inicia sesión con tu correo y contraseña. Enviaremos un código de verificación a tu correo.",
  browserAuthIntro: "Inicia sesión o crea una cuenta de forma segura en el navegador.", browserAuthLogin: "Iniciar sesión en el navegador", browserAuthRegister: "Crear una cuenta nueva",
  browserAuthStarting: "Preparando un inicio de sesión seguro…", browserAuthWaiting: "Comprueba que el código mostrado en el navegador coincida y, a continuación, aprueba el inicio de sesión.", browserAuthCode: "Código de vinculación del dispositivo", browserAuthExpiresIn: "Caduca en", browserAuthReopen: "Volver a abrir el navegador", browserAuthCancel: "Cancelar inicio de sesión", browserAuthRetry: "Reintentar", browserAuthExpired: "El código ha caducado. Vuelve a empezar para obtener otro.", browserAuthFailed: "No pudimos verificar el inicio de sesión. Reintenta o vuelve a abrir el navegador.", browserAuthOpenFailed: "No se pudo abrir el navegador. Inténtalo de nuevo.", browserAuthSignedIn: "Sesión iniciada correctamente.",
  email: "Correo electrónico", password: "Contraseña", confirmPassword: "Confirmar contraseña", code: "Código de verificación de 6 dígitos",
  login: "Iniciar sesión", enroll: "Configurar contraseña", forgotPassword: "¿Olvidaste la contraseña?", backToLogin: "Volver al inicio de sesión",
  sendCode: "Enviar código", verifyCode: "Verificar e iniciar sesión", resend: "Cambiar correo / reenviar", continue: "Continuar",
  setPassword: "Crear cuenta", passwordEnrolled: "Contraseña configurada. Inicia sesión con tu correo y contraseña.", requestReset: "Enviar enlace de restablecimiento", passwordHint: "Usa entre 6 y 128 caracteres. No se exige combinar tipos.",
  passwordMismatch: "Las contraseñas no coinciden.", passwordInvalid: "Usa entre 6 y 128 caracteres (hasta 512 bytes UTF-8).",
  loading: "Comprobando cuenta…", close: "Cerrar", loggedOut: "Sesión cerrada", signedIn: "Sesión iniciada",
  signOut: "Cerrar sesión", windowsOnly: "Las funciones de cuenta están disponibles en la aplicación de Windows instalada.",
  enterEmail: "Introduce un correo válido.", enterCode: "Introduce el código de 6 dígitos del correo.",
  codeSent: "Enviamos un código de inicio de sesión a", enrollmentSent: "Enviamos un código de configuración a", resetSent: "Si la dirección está registrada, recibirás un enlace para restablecer la contraseña.",
  privacyNote: "El correo se usa para iniciar sesión. El código caduca en 10 minutos.", displayName: "Nombre visible", displayNameHint: "Este nombre se muestra en TomoNode. No cambia tu correo de inicio de sesión.",
  saveProfile: "Guardar cambios", edit: "Editar", profileSettings: "Ajustes del perfil", avatar: "Imagen de perfil", chooseImage: "Subir imagen", removeAvatar: "Quitar imagen",
  avatarHelp: "Elige una imagen de hasta 20 MB; se comprime antes de sincronizarse.", avatarSizeError: "Elige una imagen de hasta 20 MB.",
  avatarTypeError: "Elige una imagen PNG, JPEG o WebP.", saving: "Guardando…", profileSaved: "Perfil actualizado",
  signedOutLabel: "Sin iniciar sesión", loginPrompt: "Inicia sesión en tu cuenta", loginCta: "Iniciar sesión", deviceLoginActive: "Sesión iniciada en este dispositivo",
  emailLabel: "Correo", plan: "Plan", freePlan: "Free Plan", planDescription: "Funciones básicas de gestión de servidores", seePlans: "Ver planes",
  security: "Seguridad", accountSettings: "Ajustes de cuenta", passwordChange: "Cambiar contraseña", emailChange: "Cambiar correo",
  twoFactor: "Verificación en dos pasos", devices: "Dispositivos con sesión", otherDeviceLogout: "Cerrar sesión en otros dispositivos", deleteAccount: "Eliminar cuenta",
  autoLogin: "Inicio de sesión automático", dataCollection: "Datos de uso opcionales", privacy: "Información de privacidad", emailCodeSignIn: "Se requiere un código por correo después de la contraseña", active: "Activo", preparing: "Próximamente",
};

const de: AccountCopy = {
  account: "Konto", title: "Profileinstellungen", intro: "Melde dich mit E-Mail und Passwort an. Wir senden einen Bestätigungscode an deine E-Mail-Adresse.",
  browserAuthIntro: "Melde dich sicher im Browser an oder erstelle dort ein Konto.", browserAuthLogin: "Im Browser anmelden", browserAuthRegister: "Neues Konto erstellen",
  browserAuthStarting: "Sichere Anmeldung wird vorbereitet…", browserAuthWaiting: "Vergleiche den im Browser angezeigten Code und bestätige dann die Anmeldung.", browserAuthCode: "Geräte-Kopplungscode", browserAuthExpiresIn: "Läuft ab in", browserAuthReopen: "Browser erneut öffnen", browserAuthCancel: "Anmeldung abbrechen", browserAuthRetry: "Erneut versuchen", browserAuthExpired: "Der Code ist abgelaufen. Starte erneut, um einen neuen Code zu erhalten.", browserAuthFailed: "Die Anmeldung konnte nicht bestätigt werden. Versuche es erneut oder öffne den Browser noch einmal.", browserAuthOpenFailed: "Der Browser konnte nicht geöffnet werden. Versuche es erneut.", browserAuthSignedIn: "Erfolgreich angemeldet.",
  email: "E-Mail-Adresse", password: "Passwort", confirmPassword: "Passwort bestätigen", code: "6-stelliger Bestätigungscode",
  login: "Anmelden", enroll: "Passwort einrichten", forgotPassword: "Passwort vergessen?", backToLogin: "Zurück zur Anmeldung",
  sendCode: "Code senden", verifyCode: "Bestätigen und anmelden", resend: "E-Mail ändern / erneut senden", continue: "Weiter",
  setPassword: "Konto erstellen", passwordEnrolled: "Passwort eingerichtet. Melde dich mit E-Mail und Passwort an.", requestReset: "Link zum Zurücksetzen senden", passwordHint: "6–128 Zeichen. Eine bestimmte Zeichenkombination ist nicht erforderlich.",
  passwordMismatch: "Die Passwörter stimmen nicht überein.", passwordInvalid: "6–128 Zeichen (bis zu 512 UTF-8-Bytes) verwenden.",
  loading: "Konto wird geprüft…", close: "Schließen", loggedOut: "Abgemeldet", signedIn: "Angemeldet",
  signOut: "Abmelden", windowsOnly: "Kontofunktionen sind in der installierten Windows-App verfügbar.",
  enterEmail: "Gib eine gültige E-Mail-Adresse ein.", enterCode: "Gib den 6-stelligen Code aus deiner E-Mail ein.",
  codeSent: "Wir haben einen Anmeldecode gesendet an", enrollmentSent: "Wir haben einen Einrichtungscode gesendet an", resetSent: "Falls die Adresse registriert ist, erhältst du bald einen Link zum Zurücksetzen.",
  privacyNote: "Die E-Mail wird zur Anmeldung verwendet. Der Code läuft nach 10 Minuten ab.", displayName: "Anzeigename", displayNameHint: "Dieser Name wird in TomoNode angezeigt. Deine Anmelde-E-Mail bleibt gleich.",
  saveProfile: "Änderungen speichern", edit: "Bearbeiten", profileSettings: "Profileinstellungen", avatar: "Profilbild", chooseImage: "Bild hochladen", removeAvatar: "Bild entfernen",
  avatarHelp: "Wähle ein Bild bis 20 MB; vor der Synchronisierung wird es komprimiert.", avatarSizeError: "Wähle ein Bild mit höchstens 20 MB.",
  avatarTypeError: "Wähle ein PNG-, JPEG- oder WebP-Bild.", saving: "Wird gespeichert…", profileSaved: "Profil aktualisiert",
  signedOutLabel: "Nicht angemeldet", loginPrompt: "Bei deinem Konto anmelden", loginCta: "Anmelden", deviceLoginActive: "Auf diesem Gerät angemeldet",
  emailLabel: "E-Mail", plan: "Plan", freePlan: "Free Plan", planDescription: "Grundfunktionen der Serververwaltung", seePlans: "Pläne ansehen",
  security: "Sicherheit", accountSettings: "Kontoeinstellungen", passwordChange: "Passwort ändern", emailChange: "E-Mail ändern",
  twoFactor: "Zweistufige Bestätigung", devices: "Angemeldete Geräte", otherDeviceLogout: "Andere Geräte abmelden", deleteAccount: "Konto löschen",
  autoLogin: "Automatische Anmeldung", dataCollection: "Optionale Nutzungsdaten", privacy: "Datenschutzinformationen", emailCodeSignIn: "Nach dem Passwort ist ein E-Mail-Code erforderlich", active: "Aktiv", preparing: "In Vorbereitung",
};

const fr: AccountCopy = {
  account: "Compte", title: "Paramètres du profil", intro: "Connectez-vous avec votre e-mail et votre mot de passe. Nous enverrons un code de vérification par e-mail.",
  browserAuthIntro: "Connectez-vous ou créez un compte en toute sécurité dans le navigateur.", browserAuthLogin: "Se connecter dans le navigateur", browserAuthRegister: "Créer un nouveau compte",
  browserAuthStarting: "Préparation de la connexion sécurisée…", browserAuthWaiting: "Vérifiez que le code affiché dans le navigateur correspond, puis autorisez la connexion.", browserAuthCode: "Code d’association de l’appareil", browserAuthExpiresIn: "Expire dans", browserAuthReopen: "Rouvrir le navigateur", browserAuthCancel: "Annuler la connexion", browserAuthRetry: "Réessayer", browserAuthExpired: "Ce code a expiré. Recommencez pour en obtenir un nouveau.", browserAuthFailed: "Impossible de confirmer la connexion. Réessayez ou rouvrez le navigateur.", browserAuthOpenFailed: "Impossible d’ouvrir le navigateur. Réessayez.", browserAuthSignedIn: "Connexion réussie.",
  email: "Adresse e-mail", password: "Mot de passe", confirmPassword: "Confirmer le mot de passe", code: "Code de vérification à 6 chiffres",
  login: "Se connecter", enroll: "Définir un mot de passe", forgotPassword: "Mot de passe oublié ?", backToLogin: "Retour à la connexion",
  sendCode: "Envoyer le code", verifyCode: "Vérifier et se connecter", resend: "Changer d’adresse / renvoyer", continue: "Continuer",
  setPassword: "Créer le compte", passwordEnrolled: "Mot de passe défini. Connectez-vous avec votre e-mail et votre mot de passe.", requestReset: "Envoyer le lien de réinitialisation", passwordHint: "Utilisez 6 à 128 caractères. Aucun mélange spécifique n’est requis.",
  passwordMismatch: "Les mots de passe ne correspondent pas.", passwordInvalid: "Utilisez 6 à 128 caractères (512 octets UTF-8 maximum).",
  loading: "Vérification du compte…", close: "Fermer", loggedOut: "Déconnecté", signedIn: "Connecté",
  signOut: "Se déconnecter", windowsOnly: "Les fonctions du compte sont disponibles dans l’application Windows installée.",
  enterEmail: "Saisissez une adresse e-mail valide.", enterCode: "Saisissez le code à 6 chiffres reçu par e-mail.",
  codeSent: "Nous avons envoyé un code de connexion à", enrollmentSent: "Nous avons envoyé un code de configuration à", resetSent: "Si cette adresse est enregistrée, un lien de réinitialisation arrivera bientôt.",
  privacyNote: "L’e-mail sert à la connexion. Le code expire après 10 minutes.", displayName: "Nom affiché", displayNameHint: "Ce nom apparaît dans TomoNode. L’e-mail de connexion ne change pas.",
  saveProfile: "Enregistrer", edit: "Modifier", profileSettings: "Paramètres du profil", avatar: "Image du profil", chooseImage: "Importer une image", removeAvatar: "Supprimer l’image",
  avatarHelp: "Choisissez une image de 20 Mo maximum; elle sera compressée avant la synchronisation.", avatarSizeError: "Choisissez une image de 20 Mo maximum.",
  avatarTypeError: "Choisissez une image PNG, JPEG ou WebP.", saving: "Enregistrement…", profileSaved: "Profil mis à jour",
  signedOutLabel: "Non connecté", loginPrompt: "Connectez-vous à votre compte", loginCta: "Connexion", deviceLoginActive: "Connecté sur cet appareil",
  emailLabel: "E-mail", plan: "Offre", freePlan: "Free Plan", planDescription: "Fonctions de base de gestion des serveurs", seePlans: "Voir les offres",
  security: "Sécurité", accountSettings: "Paramètres du compte", passwordChange: "Changer le mot de passe", emailChange: "Changer l’e-mail",
  twoFactor: "Validation en deux étapes", devices: "Appareils connectés", otherDeviceLogout: "Déconnecter les autres appareils", deleteAccount: "Supprimer le compte",
  autoLogin: "Connexion automatique", dataCollection: "Données d’utilisation facultatives", privacy: "Informations de confidentialité", emailCodeSignIn: "Un code e-mail est requis après le mot de passe", active: "Actif", preparing: "Bientôt disponible",
};

const ptBR: AccountCopy = {
  account: "Conta", title: "Configurações do perfil", intro: "Entre com seu e-mail e senha. Enviaremos um código de verificação por e-mail.",
  browserAuthIntro: "Entre ou crie uma conta com segurança no navegador.", browserAuthLogin: "Entrar no navegador", browserAuthRegister: "Criar uma nova conta",
  browserAuthStarting: "Preparando um login seguro…", browserAuthWaiting: "Confirme se o código exibido no navegador corresponde e aprove o login.", browserAuthCode: "Código de pareamento do dispositivo", browserAuthExpiresIn: "Expira em", browserAuthReopen: "Abrir o navegador novamente", browserAuthCancel: "Cancelar login", browserAuthRetry: "Tentar novamente", browserAuthExpired: "O código expirou. Recomece para receber outro.", browserAuthFailed: "Não foi possível confirmar o login. Tente novamente ou reabra o navegador.", browserAuthOpenFailed: "Não foi possível abrir o navegador. Tente novamente.", browserAuthSignedIn: "Login realizado.",
  email: "Endereço de e-mail", password: "Senha", confirmPassword: "Confirmar senha", code: "Código de verificação de 6 dígitos",
  login: "Entrar", enroll: "Definir senha", forgotPassword: "Esqueceu a senha?", backToLogin: "Voltar ao login",
  sendCode: "Enviar código", verifyCode: "Verificar e entrar", resend: "Trocar e-mail / reenviar", continue: "Continuar",
  setPassword: "Criar conta", passwordEnrolled: "Senha definida. Entre com seu e-mail e senha.", requestReset: "Enviar link de redefinição", passwordHint: "Use de 6 a 128 caracteres. Não é exigida combinação específica.",
  passwordMismatch: "As senhas não coincidem.", passwordInvalid: "Use de 6 a 128 caracteres (até 512 bytes UTF-8).",
  loading: "Verificando conta…", close: "Fechar", loggedOut: "Você saiu", signedIn: "Conectado",
  signOut: "Sair", windowsOnly: "Os recursos da conta estão disponíveis no aplicativo Windows instalado.",
  enterEmail: "Digite um endereço de e-mail válido.", enterCode: "Digite o código de 6 dígitos recebido por e-mail.",
  codeSent: "Enviamos um código de login para", enrollmentSent: "Enviamos um código de configuração para", resetSent: "Se o endereço estiver cadastrado, o link de redefinição chegará em breve.",
  privacyNote: "O e-mail é usado para login. O código expira em 10 minutos.", displayName: "Nome de exibição", displayNameHint: "Este nome aparece no TomoNode. O e-mail de login não muda.",
  saveProfile: "Salvar alterações", edit: "Editar", profileSettings: "Configurações do perfil", avatar: "Imagem do perfil", chooseImage: "Enviar imagem", removeAvatar: "Remover imagem",
  avatarHelp: "Escolha uma imagem de até 20 MB; ela será comprimida antes da sincronização.", avatarSizeError: "Escolha uma imagem de até 20 MB.",
  avatarTypeError: "Escolha uma imagem PNG, JPEG ou WebP.", saving: "Salvando…", profileSaved: "Perfil atualizado",
  signedOutLabel: "Desconectado", loginPrompt: "Entre na sua conta", loginCta: "Entrar", deviceLoginActive: "Conectado neste dispositivo",
  emailLabel: "E-mail", plan: "Plano", freePlan: "Free Plan", planDescription: "Recursos básicos de gerenciamento de servidores", seePlans: "Ver planos",
  security: "Segurança", accountSettings: "Configurações da conta", passwordChange: "Alterar senha", emailChange: "Alterar e-mail",
  twoFactor: "Verificação em duas etapas", devices: "Dispositivos conectados", otherDeviceLogout: "Sair de outros dispositivos", deleteAccount: "Excluir conta",
  autoLogin: "Login automático", dataCollection: "Dados de uso opcionais", privacy: "Informações de privacidade", emailCodeSignIn: "É necessário um código por e-mail após a senha", active: "Ativo", preparing: "Em breve",
};

const catalogs: Record<AppLocale, AccountCopy> = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, ko, es, de, fr, "pt-BR": ptBR };

export function accountText(locale: AppLocale): AccountCopy {
  return catalogs[locale];
}
