const API_BASE = "https://tomonode-account-api.rafaerunacaya27.workers.dev";
const form = document.querySelector("#reset-form");
const status = document.querySelector("#status");
const submitButton = document.querySelector("#submit-button");
const passwordInput = document.querySelector("#password");
const confirmInput = document.querySelector("#confirm-password");
const languageSelect = document.querySelector("#reset-language");
const translations = {
  ja: { language: "表示言語", title: "パスワードを再設定", intro: "新しいパスワードを入力してください 変更後は すべての端末で再度サインインが必要になります", password: "新しいパスワード", hint: "6〜128文字（UTF-8で512バイト以内）", confirm: "新しいパスワード（確認）", submit: "パスワードを更新", home: "TomoNode に戻る", checking: "確認しています…", valid: "メール内のリンクを確認しました 新しいパスワードを設定できます", invalid: "このリンクは無効か期限切れです アプリからパスワード再設定をもう一度依頼してください", length: "パスワードは6〜128文字 UTF-8で512バイト以内にしてください", mismatch: "確認用パスワードが一致しません", updating: "パスワードを更新しています…", limit: "試行回数が上限に達しました 時間をおいてから 再設定メールをもう一度依頼してください", failed: "パスワードを更新できませんでした リンクの期限切れの場合は アプリから再設定を依頼してください", success: "パスワードを更新しました TomoNodeアプリで新しいパスワードを使ってサインインしてください", network: "通信に失敗しました インターネット接続を確認して もう一度お試しください" },
  en: { language: "Language", title: "Reset your password", intro: "Enter a new password. After changing it, you will need to sign in again on all devices.", password: "New password", hint: "6–128 characters (up to 512 UTF-8 bytes)", confirm: "Confirm new password", submit: "Update password", home: "Back to TomoNode", checking: "Checking…", valid: "Email link verified. You can set a new password.", invalid: "This link is invalid or has expired. Request another password reset in the app.", length: "Use 6–128 characters and no more than 512 UTF-8 bytes.", mismatch: "Passwords do not match.", updating: "Updating your password…", limit: "Too many attempts. Wait, then request another reset email in the app.", failed: "Could not update your password. If the link expired, request another reset in the app.", success: "Password updated. Sign in to the TomoNode app with your new password.", network: "Connection failed. Check your internet connection and try again." },
  de: { language: "Sprache", title: "Passwort zurücksetzen", intro: "Gib ein neues Passwort ein. Danach musst du dich auf allen Geräten erneut anmelden.", password: "Neues Passwort", hint: "6–128 Zeichen (höchstens 512 UTF-8-Bytes)", confirm: "Neues Passwort bestätigen", submit: "Passwort ändern", home: "Zurück zu TomoNode", checking: "Wird geprüft…", valid: "E-Mail-Link bestätigt. Du kannst ein neues Passwort festlegen.", invalid: "Dieser Link ist ungültig oder abgelaufen. Fordere in der App einen neuen Link an.", length: "Verwende 6–128 Zeichen und höchstens 512 UTF-8-Bytes.", mismatch: "Die Passwörter stimmen nicht überein.", updating: "Passwort wird geändert…", limit: "Zu viele Versuche. Warte und fordere in der App eine neue E-Mail an.", failed: "Das Passwort konnte nicht geändert werden. Fordere bei abgelaufenem Link in der App einen neuen an.", success: "Passwort geändert. Melde dich in TomoNode mit dem neuen Passwort an.", network: "Verbindung fehlgeschlagen. Prüfe deine Internetverbindung und versuche es erneut." },
  es: { language: "Idioma", title: "Restablecer contraseña", intro: "Introduce una contraseña nueva. Después tendrás que volver a iniciar sesión en todos tus dispositivos.", password: "Contraseña nueva", hint: "6–128 caracteres (máximo 512 bytes UTF-8)", confirm: "Confirmar contraseña nueva", submit: "Actualizar contraseña", home: "Volver a TomoNode", checking: "Comprobando…", valid: "Enlace de correo verificado. Ya puedes establecer una contraseña nueva.", invalid: "El enlace no es válido o ha caducado. Solicita otro restablecimiento desde la aplicación.", length: "Usa entre 6 y 128 caracteres y un máximo de 512 bytes UTF-8.", mismatch: "Las contraseñas no coinciden.", updating: "Actualizando contraseña…", limit: "Demasiados intentos. Espera y solicita otro correo desde la aplicación.", failed: "No se pudo actualizar la contraseña. Si el enlace caducó, solicita otro desde la aplicación.", success: "Contraseña actualizada. Inicia sesión en TomoNode con la nueva contraseña.", network: "Falló la conexión. Comprueba Internet e inténtalo otra vez." },
  fr: { language: "Langue", title: "Réinitialiser le mot de passe", intro: "Saisissez un nouveau mot de passe. Vous devrez ensuite vous reconnecter sur tous vos appareils.", password: "Nouveau mot de passe", hint: "6 à 128 caractères (512 octets UTF-8 maximum)", confirm: "Confirmer le mot de passe", submit: "Mettre à jour le mot de passe", home: "Retour à TomoNode", checking: "Vérification…", valid: "Lien de l'e-mail vérifié. Vous pouvez définir un nouveau mot de passe.", invalid: "Ce lien est invalide ou expiré. Demandez une nouvelle réinitialisation dans l'application.", length: "Utilisez 6 à 128 caractères et au plus 512 octets UTF-8.", mismatch: "Les mots de passe ne correspondent pas.", updating: "Mise à jour du mot de passe…", limit: "Trop de tentatives. Patientez puis demandez un nouvel e-mail dans l'application.", failed: "Impossible de mettre à jour le mot de passe. Si le lien a expiré, faites une nouvelle demande dans l'application.", success: "Mot de passe mis à jour. Connectez-vous à TomoNode avec le nouveau mot de passe.", network: "Échec de la connexion. Vérifiez votre accès Internet et réessayez." },
  ko: { language: "언어", title: "비밀번호 재설정", intro: "새 비밀번호를 입력하세요 변경 후에는 모든 기기에서 다시 로그인해야 합니다", password: "새 비밀번호", hint: "6~128자 (UTF-8 최대 512바이트)", confirm: "새 비밀번호 확인", submit: "비밀번호 변경", home: "TomoNode로 돌아가기", checking: "확인 중…", valid: "이메일 링크를 확인했습니다 새 비밀번호를 설정할 수 있습니다", invalid: "링크가 잘못되었거나 만료되었습니다 앱에서 다시 재설정을 요청하세요", length: "6~128자와 UTF-8 512바이트 이내로 입력하세요", mismatch: "비밀번호가 일치하지 않습니다", updating: "비밀번호 변경 중…", limit: "시도 횟수를 초과했습니다 잠시 후 앱에서 새 이메일을 요청하세요", failed: "비밀번호를 변경할 수 없습니다 링크가 만료되었다면 앱에서 다시 요청하세요", success: "비밀번호가 변경되었습니다 새 비밀번호로 TomoNode 앱에 로그인하세요", network: "연결에 실패했습니다 인터넷을 확인하고 다시 시도하세요" },
  "pt-BR": { language: "Idioma", title: "Redefinir senha", intro: "Digite uma nova senha. Depois da alteração, será preciso entrar novamente em todos os dispositivos.", password: "Nova senha", hint: "6 a 128 caracteres (até 512 bytes em UTF-8)", confirm: "Confirme a nova senha", submit: "Atualizar senha", home: "Voltar ao TomoNode", checking: "Verificando…", valid: "Link do e-mail confirmado. Você pode definir uma nova senha.", invalid: "Este link é inválido ou expirou. Peça outra redefinição no aplicativo.", length: "Use 6 a 128 caracteres e no máximo 512 bytes em UTF-8.", mismatch: "As senhas não coincidem.", updating: "Atualizando a senha…", limit: "Muitas tentativas. Aguarde e peça outro e-mail no aplicativo.", failed: "Não foi possível atualizar a senha. Se o link expirou, peça outro no aplicativo.", success: "Senha atualizada. Entre no TomoNode com a nova senha.", network: "Falha na conexão. Verifique a internet e tente novamente." },
  "zh-CN": { language: "语言", title: "重置密码", intro: "请输入新密码 更改后需要在所有设备上重新登录", password: "新密码", hint: "6 至 128 个字符（UTF-8 不超过 512 字节）", confirm: "确认新密码", submit: "更新密码", home: "返回 TomoNode", checking: "正在检查…", valid: "邮件链接已验证 现在可以设置新密码", invalid: "链接无效或已过期 请在应用中重新请求重置", length: "请输入 6 至 128 个字符 且 UTF-8 不超过 512 字节", mismatch: "两次输入的密码不一致", updating: "正在更新密码…", limit: "尝试次数过多 请稍后在应用中重新请求邮件", failed: "无法更新密码 如果链接已过期 请在应用中重新请求", success: "密码已更新 请使用新密码登录 TomoNode 应用", network: "连接失败 请检查网络后重试" },
  "zh-TW": { language: "語言", title: "重設密碼", intro: "請輸入新密碼 變更後須在所有裝置重新登入", password: "新密碼", hint: "6 至 128 個字元（UTF-8 不超過 512 位元組）", confirm: "確認新密碼", submit: "更新密碼", home: "返回 TomoNode", checking: "正在檢查…", valid: "郵件連結已驗證 現在可以設定新密碼", invalid: "連結無效或已過期 請在應用程式中重新要求重設", length: "請輸入 6 至 128 個字元 且 UTF-8 不超過 512 位元組", mismatch: "兩次輸入的密碼不一致", updating: "正在更新密碼…", limit: "嘗試次數過多 請稍後在應用程式中重新要求郵件", failed: "無法更新密碼 若連結已過期 請在應用程式中重新要求", success: "密碼已更新 請使用新密碼登入 TomoNode 應用程式", network: "連線失敗 請檢查網路後重試" },
};
function preferredLocale() {
  let selected = "";
  try { selected = localStorage.getItem("tomonode-site:locale-choice") || ""; } catch {}
  if (translations[selected]) return selected;
  for (const choice of navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"]) {
    const language = choice.toLowerCase();
    if (/^zh-(tw|hk|mo)/.test(language)) return "zh-TW";
    if (language.startsWith("zh")) return "zh-CN";
    if (language.startsWith("pt")) return "pt-BR";
    const base = language.split("-")[0];
    if (translations[base]) return base;
  }
  return "en";
}
let locale = preferredLocale();
let statusKey = "checking";
function renderLanguage() {
  const t = translations[locale];
  document.documentElement.lang = locale;
  document.title = `${t.title} | TomoNode`;
  document.querySelector("#language-label").textContent = t.language;
  document.querySelector("h1").textContent = t.title;
  document.querySelector(".intro").textContent = t.intro;
  document.querySelector('label[for="password"]').textContent = t.password;
  document.querySelector(".hint").textContent = t.hint;
  document.querySelector('label[for="confirm-password"]').textContent = t.confirm;
  submitButton.textContent = t.submit;
  document.querySelector(".home-link").textContent = t.home;
  languageSelect.value = locale;
  status.textContent = t[statusKey];
}
languageSelect.addEventListener("change", () => {
  locale = languageSelect.value;
  try { localStorage.setItem("tomonode-site:locale-choice", locale); } catch {}
  renderLanguage();
});
renderLanguage();
const parameters = new URLSearchParams(window.location.search);
const actionCode = parameters.get("oobCode") ?? "";
const actionMode = parameters.get("mode") ?? "";
if (actionCode) history.replaceState(null, "", "/password-reset.html");

function showStatus(key, isError = false) {
  statusKey = key;
  status.textContent = translations[locale][key];
  status.classList.toggle("error", isError);
}

function validPassword(value) {
  const length = Array.from(value).length;
  return length >= 6 && length <= 128 && new TextEncoder().encode(value).byteLength <= 512;
}

if (actionMode === "resetPassword" && actionCode.length >= 10 && actionCode.length <= 4096) {
  form.hidden = false;
  showStatus("valid");
} else {
  showStatus("invalid", true);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!validPassword(password)) {
    showStatus("length", true);
    return;
  }
  if (password !== confirmInput.value) {
    showStatus("mismatch", true);
    confirmInput.focus();
    return;
  }

  submitButton.disabled = true;
  passwordInput.disabled = true;
  confirmInput.disabled = true;
  showStatus("updating");
  try {
    const response = await fetch(`${API_BASE}/v1/auth/password/complete-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oobCode: actionCode, newPassword: password }),
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) {
      showStatus(response.status === 429 ? "limit" : "failed", true);
      submitButton.disabled = false;
      passwordInput.disabled = false;
      confirmInput.disabled = false;
      return;
    }
    history.replaceState(null, "", "/password-reset.html");
    form.hidden = true;
    showStatus("success");
  } catch {
    showStatus("network", true);
    submitButton.disabled = false;
    passwordInput.disabled = false;
    confirmInput.disabled = false;
  }
});
