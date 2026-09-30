const API_BASE = "https://tomonode-account-api.rafaerunacaya27.workers.dev";
const form = document.querySelector("#reset-form");
const status = document.querySelector("#status");
const submitButton = document.querySelector("#submit-button");
const passwordInput = document.querySelector("#password");
const confirmInput = document.querySelector("#confirm-password");
const languageSelect = document.querySelector("#reset-language");
const titleElement = document.querySelector("h1");
const introElement = document.querySelector(".intro");
const recoveryHandoffButton = document.querySelector("#recovery-handoff");
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

const actionTranslations = {
  ja: { emailTitle: "メールアドレスを変更", emailIntro: "メール内のリンクを確認しています。完了後はTomoNodeデスクトップアプリで新しいメールアドレスと現在のパスワードを使って再度サインインしてください。", emailChecking: "メールアドレスの変更を確認しています…", emailSuccess: "メールアドレスを変更しました。デスクトップアプリで新しいメールアドレスと現在のパスワードを使ってサインインしてください。必要に応じてアプリを再起動してください。", emailInvalid: "この確認リンクは無効か期限切れです。メールアドレス変更をもう一度アプリから依頼してください。", emailLimit: "試行回数が上限に達しました。時間をおいてからもう一度お試しください。", emailInUse: "この変更を完了できませんでした。別のメールアドレスで変更をもう一度依頼してください。現在のメールアドレスは変更されていません。", emailUnavailable: "メールアドレス変更サービスを現在利用できません。時間をおいてからもう一度お試しください。", emailFailed: "メールアドレスを変更できませんでした。現在のメールアドレスでサインインし、アプリからもう一度変更を依頼してください。", emailNetwork: "通信に失敗しました。リンクはこのページから再利用できません。メールアドレス変更をアプリからもう一度依頼してください。", recoverTitle: "メールアドレスの変更を取り消す", recoverIntro: "Firebaseの安全な画面で、以前のメールアドレスに戻す操作を続けられます。自動的には移動しません。", recoverReady: "ボタンを押すとFirebaseの公式画面に移動して変更を取り消します。その後、以前のメールアドレスとパスワードでTomoNodeに再度サインインし、確認コードを入力してください。", recoverUnavailable: "この復旧リンクを安全に確認できませんでした。メールからリンクを開き直すか、サポートにお問い合わせください。", recoverHandoff: "Firebase でメール変更を取り消す" },
  en: { emailTitle: "Change your email address", emailIntro: "We’re checking the link in your email. After it completes, sign in to the TomoNode desktop app again with your new email address and current password.", emailChecking: "Confirming your email address change…", emailSuccess: "Your email address has changed. Sign in to the TomoNode desktop app with your new email address and current password. Restart the app if needed.", emailInvalid: "This confirmation link is invalid or expired. Request another email change from the app.", emailLimit: "Too many attempts. Wait a while, then try again.", emailInUse: "This change could not be completed. Request it again with a different email address. Your current address has not changed.", emailUnavailable: "Email changes are unavailable right now. Try again later.", emailFailed: "Your email address could not be changed. Sign in with your current address and request the change again from the app.", emailNetwork: "The request could not be completed. This link cannot be reused from this page; request another email change from the app.", recoverTitle: "Undo an email address change", recoverIntro: "Continue in Firebase’s secure page to restore your previous email address. You will not be redirected automatically.", recoverReady: "Choose the button to open Firebase’s official page and undo the change. Then sign in to TomoNode again with your previous email and password, and enter the verification code.", recoverUnavailable: "This recovery link could not be verified safely. Reopen it from your email or contact support.", recoverHandoff: "Continue to Firebase to undo the change" },
  de: { emailTitle: "E-Mail-Adresse ändern", emailIntro: "Der Link in deiner E-Mail wird geprüft. Melde dich danach in der TomoNode-Desktop-App erneut mit deiner neuen E-Mail-Adresse und deinem bisherigen Passwort an.", emailChecking: "E-Mail-Änderung wird bestätigt…", emailSuccess: "Deine E-Mail-Adresse wurde geändert. Melde dich in der TomoNode-Desktop-App mit der neuen Adresse und deinem bisherigen Passwort an. Starte die App bei Bedarf neu.", emailInvalid: "Dieser Bestätigungslink ist ungültig oder abgelaufen. Fordere in der App eine neue E-Mail-Änderung an.", emailLimit: "Zu viele Versuche. Warte eine Weile und versuche es erneut.", emailInUse: "Die Änderung konnte nicht abgeschlossen werden. Fordere sie mit einer anderen E-Mail-Adresse erneut an. Deine aktuelle Adresse bleibt unverändert.", emailUnavailable: "E-Mail-Änderungen sind derzeit nicht verfügbar. Versuche es später erneut.", emailFailed: "Deine E-Mail-Adresse konnte nicht geändert werden. Melde dich mit der aktuellen Adresse an und fordere die Änderung erneut in der App an.", emailNetwork: "Die Anfrage konnte nicht abgeschlossen werden. Dieser Link kann hier nicht wiederverwendet werden; fordere eine neue Änderung in der App an.", recoverTitle: "E-Mail-Änderung rückgängig machen", recoverIntro: "Setze den Vorgang auf der sicheren Firebase-Seite fort, um deine vorherige E-Mail-Adresse wiederherzustellen. Du wirst nicht automatisch weitergeleitet.", recoverReady: "Öffne über die Schaltfläche die offizielle Firebase-Seite und mache die Änderung rückgängig. Melde dich danach mit deiner vorherigen E-Mail-Adresse und deinem Passwort erneut bei TomoNode an und gib den Bestätigungscode ein.", recoverUnavailable: "Dieser Wiederherstellungslink konnte nicht sicher geprüft werden. Öffne ihn erneut aus deiner E-Mail oder wende dich an den Support.", recoverHandoff: "Bei Firebase fortfahren und Änderung rückgängig machen" },
  es: { emailTitle: "Cambiar dirección de correo", emailIntro: "Estamos comprobando el enlace del correo. Después, vuelve a iniciar sesión en la aplicación de escritorio TomoNode con tu nueva dirección y la contraseña actual.", emailChecking: "Confirmando el cambio de correo…", emailSuccess: "Se cambió tu dirección de correo. Inicia sesión en TomoNode con la nueva dirección y la contraseña actual. Reinicia la aplicación si es necesario.", emailInvalid: "El enlace de confirmación no es válido o ha caducado. Solicita otro cambio desde la aplicación.", emailLimit: "Demasiados intentos. Espera un poco y vuelve a intentarlo.", emailInUse: "No se pudo completar el cambio. Solicítalo otra vez con otra dirección. Tu dirección actual no ha cambiado.", emailUnavailable: "El cambio de correo no está disponible ahora. Inténtalo más tarde.", emailFailed: "No se pudo cambiar el correo. Inicia sesión con la dirección actual y solicita el cambio otra vez desde la aplicación.", emailNetwork: "No se pudo completar la solicitud. Este enlace no se puede reutilizar aquí; solicita otro cambio desde la aplicación.", recoverTitle: "Deshacer un cambio de correo", recoverIntro: "Continúa en la página segura de Firebase para recuperar la dirección anterior. No habrá una redirección automática.", recoverReady: "Pulsa el botón para abrir la página oficial de Firebase y deshacer el cambio. Después, inicia sesión de nuevo en TomoNode con la dirección anterior y la contraseña, e introduce el código de verificación.", recoverUnavailable: "No se pudo verificar este enlace de recuperación de forma segura. Ábrelo de nuevo desde el correo o contacta con soporte.", recoverHandoff: "Ir a Firebase para deshacer el cambio" },
  fr: { emailTitle: "Modifier l’adresse e-mail", emailIntro: "Nous vérifions le lien reçu par e-mail. Ensuite, reconnectez-vous à l’application TomoNode avec votre nouvelle adresse et votre mot de passe actuel.", emailChecking: "Confirmation de la modification de l’adresse…", emailSuccess: "Votre adresse e-mail a été modifiée. Connectez-vous à TomoNode avec la nouvelle adresse et votre mot de passe actuel. Redémarrez l’application si nécessaire.", emailInvalid: "Ce lien de confirmation est invalide ou expiré. Demandez une nouvelle modification dans l’application.", emailLimit: "Trop de tentatives. Patientez puis réessayez.", emailInUse: "La modification n’a pas pu aboutir. Demandez-la de nouveau avec une autre adresse. Votre adresse actuelle n’a pas changé.", emailUnavailable: "La modification d’adresse est indisponible pour le moment. Réessayez plus tard.", emailFailed: "Impossible de modifier votre adresse. Connectez-vous avec l’adresse actuelle et redemandez la modification dans l’application.", emailNetwork: "La demande n’a pas abouti. Ce lien ne peut pas être réutilisé ici ; demandez une nouvelle modification dans l’application.", recoverTitle: "Annuler la modification de l’adresse", recoverIntro: "Continuez sur la page sécurisée de Firebase pour rétablir votre ancienne adresse. Aucune redirection automatique n’aura lieu.", recoverReady: "Utilisez le bouton pour ouvrir la page officielle de Firebase et annuler la modification. Reconnectez-vous ensuite à TomoNode avec votre ancienne adresse et votre mot de passe, puis saisissez le code de vérification.", recoverUnavailable: "Ce lien de récupération n’a pas pu être vérifié en toute sécurité. Rouvrez-le depuis votre e-mail ou contactez l’assistance.", recoverHandoff: "Continuer sur Firebase pour annuler la modification" },
  ko: { emailTitle: "이메일 주소 변경", emailIntro: "이메일 링크를 확인하고 있습니다. 완료 후 새 이메일 주소와 현재 비밀번호로 TomoNode 데스크톱 앱에 다시 로그인하세요.", emailChecking: "이메일 주소 변경 확인 중…", emailSuccess: "이메일 주소가 변경되었습니다. 새 주소와 현재 비밀번호로 TomoNode 앱에 로그인하세요. 필요하면 앱을 다시 시작하세요.", emailInvalid: "확인 링크가 잘못되었거나 만료되었습니다. 앱에서 이메일 변경을 다시 요청하세요.", emailLimit: "시도 횟수를 초과했습니다. 잠시 후 다시 시도하세요.", emailInUse: "변경을 완료할 수 없습니다. 다른 이메일 주소로 다시 요청하세요. 현재 주소는 변경되지 않았습니다.", emailUnavailable: "지금은 이메일 변경을 사용할 수 없습니다. 나중에 다시 시도하세요.", emailFailed: "이메일 주소를 변경할 수 없습니다. 현재 주소로 로그인한 뒤 앱에서 다시 요청하세요.", emailNetwork: "요청을 완료하지 못했습니다. 이 링크는 여기서 재사용할 수 없습니다. 앱에서 다시 요청하세요.", recoverTitle: "이메일 주소 변경 취소", recoverIntro: "이전 이메일 주소를 복원하려면 Firebase 보안 페이지에서 계속하세요. 자동으로 이동하지 않습니다.", recoverReady: "버튼을 눌러 Firebase 공식 페이지에서 변경을 취소하세요. 그런 다음 이전 이메일과 비밀번호로 TomoNode에 다시 로그인하고 확인 코드를 입력하세요.", recoverUnavailable: "복구 링크를 안전하게 확인할 수 없습니다. 이메일에서 다시 열거나 지원팀에 문의하세요.", recoverHandoff: "Firebase에서 변경 취소 계속하기" },
  "pt-BR": { emailTitle: "Alterar endereço de e-mail", emailIntro: "Estamos verificando o link enviado por e-mail. Depois, entre novamente no aplicativo TomoNode com o novo endereço e a senha atual.", emailChecking: "Confirmando a alteração do e-mail…", emailSuccess: "Seu endereço de e-mail foi alterado. Entre no TomoNode com o novo endereço e a senha atual. Reinicie o aplicativo se necessário.", emailInvalid: "Este link de confirmação é inválido ou expirou. Peça outra alteração pelo aplicativo.", emailLimit: "Muitas tentativas. Aguarde um pouco e tente novamente.", emailInUse: "Não foi possível concluir a alteração. Solicite novamente com outro endereço. Seu endereço atual não foi alterado.", emailUnavailable: "A alteração de e-mail está indisponível agora. Tente novamente mais tarde.", emailFailed: "Não foi possível alterar seu e-mail. Entre com o endereço atual e solicite a alteração novamente no aplicativo.", emailNetwork: "Não foi possível concluir a solicitação. Este link não pode ser reutilizado aqui; solicite outra alteração no aplicativo.", recoverTitle: "Desfazer alteração do e-mail", recoverIntro: "Continue na página segura do Firebase para restaurar seu endereço anterior. Você não será redirecionado automaticamente.", recoverReady: "Use o botão para abrir a página oficial do Firebase e desfazer a alteração. Depois, entre novamente no TomoNode com o endereço anterior e a senha e informe o código de verificação.", recoverUnavailable: "Não foi possível verificar este link de recuperação com segurança. Abra-o novamente pelo e-mail ou contate o suporte.", recoverHandoff: "Continuar no Firebase para desfazer a alteração" },
  "zh-CN": { emailTitle: "更改电子邮件地址", emailIntro: "正在检查邮件中的链接。完成后，请使用新邮箱和当前密码重新登录 TomoNode 桌面应用。", emailChecking: "正在确认邮箱更改…", emailSuccess: "邮箱地址已更改。请使用新邮箱和当前密码登录 TomoNode；如有需要，请重启应用。", emailInvalid: "此确认链接无效或已过期。请在应用中重新请求更改邮箱。", emailLimit: "尝试次数过多，请稍后重试。", emailInUse: "无法完成此次更改。请使用其他邮箱重新请求；当前邮箱未更改。", emailUnavailable: "目前无法更改邮箱，请稍后重试。", emailFailed: "无法更改邮箱。请使用当前邮箱登录，并在应用中重新请求更改。", emailNetwork: "请求未能完成。此链接无法在此页面重用，请在应用中重新请求更改。", recoverTitle: "撤销邮箱更改", recoverIntro: "请在 Firebase 安全页面继续，以恢复之前的邮箱地址。页面不会自动跳转。", recoverReady: "点击按钮打开 Firebase 官方页面并撤销更改。之后请使用之前的邮箱和密码重新登录 TomoNode，并输入验证码。", recoverUnavailable: "无法安全验证此恢复链接。请从邮件重新打开，或联系支持。", recoverHandoff: "前往 Firebase 撤销更改" },
  "zh-TW": { emailTitle: "變更電子郵件地址", emailIntro: "正在檢查郵件中的連結。完成後，請使用新信箱與目前密碼重新登入 TomoNode 桌面應用程式。", emailChecking: "正在確認信箱變更…", emailSuccess: "信箱地址已變更。請使用新信箱與目前密碼登入 TomoNode；如有需要，請重新啟動應用程式。", emailInvalid: "此確認連結無效或已過期。請在應用程式中重新要求變更信箱。", emailLimit: "嘗試次數過多，請稍後再試。", emailInUse: "無法完成此次變更。請改用其他信箱重新要求；目前信箱未變更。", emailUnavailable: "目前無法變更信箱，請稍後再試。", emailFailed: "無法變更信箱。請使用目前信箱登入，並在應用程式中重新要求變更。", emailNetwork: "要求未能完成。此連結無法在此頁面重複使用，請在應用程式中重新要求變更。", recoverTitle: "復原信箱變更", recoverIntro: "請在 Firebase 安全頁面繼續，以還原先前的信箱地址。頁面不會自動跳轉。", recoverReady: "按下按鈕開啟 Firebase 官方頁面並復原變更。之後請使用先前的信箱與密碼重新登入 TomoNode，並輸入驗證碼。", recoverUnavailable: "無法安全驗證此復原連結。請從郵件重新開啟，或聯絡支援。", recoverHandoff: "前往 Firebase 復原變更" },
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
const parameters = new URLSearchParams(window.location.search);
let actionCode = parameters.get("oobCode") ?? "";
const actionMode = parameters.get("mode") ?? "";
let recoveryApiKey = parameters.get("apiKey") ?? "";
if (window.location.search || window.location.hash) {
  history.replaceState(null, "", window.location.pathname);
}
let locale = preferredLocale();
const linkLocale = parameters.get("lang") ?? "";
if (translations[linkLocale]) locale = linkLocale;
let screenMode = actionMode === "verifyAndChangeEmail" ? "emailChange" : actionMode === "recoverEmail" ? "recoverEmail" : "reset";
let recoveryReady = false;
let statusKey = "checking";

function messageFor(key) {
  return translations[locale][key] ?? actionTranslations[locale]?.[key] ?? translations.en[key] ?? actionTranslations.en[key] ?? key;
}

function renderLanguage() {
  const t = translations[locale];
  const action = actionTranslations[locale] ?? actionTranslations.en;
  const title = screenMode === "reset" ? t.title : action[screenMode === "emailChange" ? "emailTitle" : "recoverTitle"];
  const intro = screenMode === "reset" ? t.intro : action[screenMode === "emailChange" ? "emailIntro" : "recoverIntro"];
  document.documentElement.lang = locale;
  document.title = `${title} | TomoNode`;
  document.querySelector("#language-label").textContent = t.language;
  titleElement.textContent = title;
  introElement.textContent = intro;
  document.querySelector('label[for="password"]').textContent = t.password;
  document.querySelector(".hint").textContent = t.hint;
  document.querySelector('label[for="confirm-password"]').textContent = t.confirm;
  submitButton.textContent = t.submit;
  document.querySelector(".home-link").textContent = t.home;
  recoveryHandoffButton.textContent = action.recoverHandoff;
  recoveryHandoffButton.hidden = screenMode !== "recoverEmail" || !recoveryReady;
  languageSelect.value = locale;
  status.textContent = messageFor(statusKey);
}

function showStatus(key, isError = false, isSuccess = false) {
  statusKey = key;
  status.textContent = messageFor(key);
  status.classList.toggle("error", isError);
  status.classList.toggle("success", isSuccess);
}

languageSelect.addEventListener("change", () => {
  locale = languageSelect.value;
  try { localStorage.setItem("tomonode-site:locale-choice", locale); } catch {}
  renderLanguage();
});
renderLanguage();

function validActionCode(value) {
  return value.length >= 10 && value.length <= 4096;
}

function validPassword(value) {
  const length = Array.from(value).length;
  return length >= 6 && length <= 128 && new TextEncoder().encode(value).byteLength <= 512;
}

async function completeEmailChange() {
  showStatus("emailChecking");
  try {
    const response = await fetch(`${API_BASE}/v1/auth/email-change/complete`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ oobCode: actionCode }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    let data = {};
    try { data = await response.json(); } catch {}
    actionCode = "";
    if (response.ok && data.emailChanged === true && typeof data.account?.email === "string" && data.account.email.includes("@")) {
      showStatus("emailSuccess", false, true);
    } else if (response.status === 429) {
      showStatus("emailLimit", true);
    } else if (response.status === 503) {
      showStatus("emailUnavailable", true);
    } else if (response.status === 409 && data.error === "EMAIL_IN_USE") {
      showStatus("emailInUse", true);
    } else if (response.status === 400 || response.status === 401 || data.error === "INVALID_OR_EXPIRED_EMAIL_CHANGE") {
      showStatus("emailInvalid", true);
    } else {
      showStatus("emailFailed", true);
    }
  } catch {
    actionCode = "";
    showStatus("emailNetwork", true);
  }
}

if (actionMode === "resetPassword" && validActionCode(actionCode)) {
  form.hidden = false;
  showStatus("valid");
} else if (actionMode === "verifyAndChangeEmail" && validActionCode(actionCode)) {
  form.hidden = true;
  void completeEmailChange();
} else if (actionMode === "recoverEmail") {
  const candidate = recoveryApiKey;
  recoveryReady = validActionCode(actionCode) && /^AIza[A-Za-z0-9_-]{20,64}$/.test(candidate);
  if (!recoveryReady) recoveryApiKey = "";
  showStatus(recoveryReady ? "recoverReady" : "recoverUnavailable", !recoveryReady, recoveryReady);
  renderLanguage();
} else {
  showStatus("invalid", true);
}

recoveryHandoffButton.addEventListener("click", () => {
  if (!recoveryReady || !validActionCode(actionCode)) {
    recoveryReady = false;
    renderLanguage();
    showStatus("recoverUnavailable", true);
    return;
  }
  const target = new URL("https://tomonode-auth.firebaseapp.com/__/auth/action");
  target.searchParams.set("apiKey", recoveryApiKey);
  target.searchParams.set("oobCode", actionCode);
  target.searchParams.set("mode", "recoverEmail");
  target.searchParams.set("lang", locale);
  if (target.origin !== "https://tomonode-auth.firebaseapp.com") {
    recoveryReady = false;
    renderLanguage();
    showStatus("recoverUnavailable", true);
    return;
  }
  const handoffUrl = target.toString();
  recoveryApiKey = "";
  actionCode = "";
  recoveryReady = false;
  window.location.assign(handoffUrl);
});

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
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ oobCode: actionCode, newPassword: password }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      if (response.status !== 429 && response.status < 500) {
        actionCode = "";
        form.hidden = true;
      }
      passwordInput.value = "";
      confirmInput.value = "";
      showStatus(response.status === 429 ? "limit" : "failed", true);
      submitButton.disabled = false;
      passwordInput.disabled = false;
      confirmInput.disabled = false;
      return;
    }
    actionCode = "";
    form.hidden = true;
    passwordInput.value = "";
    confirmInput.value = "";
    showStatus("success", false, true);
  } catch {
    passwordInput.value = "";
    confirmInput.value = "";
    showStatus("network", true);
    submitButton.disabled = false;
    passwordInput.disabled = false;
    confirmInput.disabled = false;
  }
});
