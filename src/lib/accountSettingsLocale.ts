import type { AppLocale } from "./i18n";

interface AccountSettingsCopy {
  profileTab: string;
  userId: string;
  accountCreated: string;
  currentPlan: string;
  comparePlans: string;
  freePrice: string;
  freeSummary: string;
  freeBenefits: [string, string, string];
  supporter: string;
  supporterPending: string;
  currentPlanButton: string;
  copyUserId: string;
  userIdCopied: string;
  userIdCopyFailed: string;
  emailChangeDescription: string;
  emailChangeNewEmail: string;
  emailChangeCurrentPassword: string;
  emailChangeSend: string;
  emailChangeCancel: string;
  emailChangeBack: string;
  emailChangePasswordRequired: string;
  emailChangeRequested: string;
  imageHint: string;
  imageDecodeError: string;
  imageEncodeError: string;
}

const en: AccountSettingsCopy = {
  profileTab: "Profile", userId: "User ID", accountCreated: "Account created", currentPlan: "Current plan", comparePlans: "Compare plans",
  freePrice: "Free", freeSummary: "Use TomoNode's basic features at no cost.", freeBenefits: ["Create servers", "Use the basic features", "Use templates"],
  supporter: "Supporter", supporterPending: "Pricing and benefits are not available yet.", currentPlanButton: "Current plan",
  copyUserId: "Copy ID", userIdCopied: "Copied", userIdCopyFailed: "Couldn't copy the user ID.",
  emailChangeDescription: "Enter the new email address and your current password. Your sign-in email changes only after you confirm the link we send.",
  emailChangeNewEmail: "New email address", emailChangeCurrentPassword: "Current password", emailChangeSend: "Send confirmation link", emailChangeCancel: "Cancel", emailChangeBack: "Back",
  emailChangePasswordRequired: "Set a password before changing your email address.",
  emailChangeRequested: "We sent a confirmation link to the new address. Your current email stays active until you confirm it; after confirmation, sign in with your new address.",
  imageHint: "Choose an image up to 20 MB. TomoNode crops and compresses it automatically before syncing.",
  imageDecodeError: "This image could not be opened. Try a PNG, JPEG, WebP, or another supported image.",
  imageEncodeError: "This image could not be prepared as an icon. Try a different image.",
};

const ja: AccountSettingsCopy = {
  profileTab: "プロフィール", userId: "ユーザーID", accountCreated: "アカウント作成日", currentPlan: "現在のプラン", comparePlans: "プランの比較",
  freePrice: "¥0／月", freeSummary: "TomoNodeの基本機能を無料で利用できます。", freeBenefits: ["サーバーを作成", "基本機能を利用", "テンプレートを利用"],
  supporter: "Supporter", supporterPending: "料金・特典は未定です。決済はまだ利用できません。", currentPlanButton: "現在のプラン",
  copyUserId: "IDをコピー", userIdCopied: "コピーしました", userIdCopyFailed: "ユーザーIDをコピーできませんでした。",
  emailChangeDescription: "変更先のメールアドレスと現在のパスワードを入力してください。確認リンクを開くまで、ログイン用メールアドレスは変わりません。",
  emailChangeNewEmail: "変更後のメールアドレス", emailChangeCurrentPassword: "現在のパスワード", emailChangeSend: "確認リンクを送信", emailChangeCancel: "キャンセル", emailChangeBack: "戻る",
  emailChangePasswordRequired: "メールアドレスを変更するには、先にパスワードを設定してください。",
  emailChangeRequested: "変更先のメールアドレスに確認リンクを送信しました。確認が完了するまでログイン用メールアドレスは変わりません。確認後は新しいアドレスでログインしてください。",
  imageHint: "20 MBまでの画像を選べます。正方形に切り抜き・圧縮してから同期します。",
  imageDecodeError: "画像を読み込めませんでした。PNG・JPEG・WebPなどの画像を選んでください。",
  imageEncodeError: "画像をアイコン用に変換できませんでした。別の画像を試してください。",
};

const zhCN: AccountSettingsCopy = {
  profileTab: "个人资料", userId: "用户 ID", accountCreated: "账户创建日期", currentPlan: "当前方案", comparePlans: "比较方案",
  freePrice: "免费", freeSummary: "免费使用 TomoNode 的基本功能。", freeBenefits: ["创建服务器", "使用基本功能", "使用模板"],
  supporter: "Supporter", supporterPending: "价格和权益尚未确定，暂不能付款。", currentPlanButton: "当前方案",
  copyUserId: "复制 ID", userIdCopied: "已复制", userIdCopyFailed: "无法复制用户 ID。",
  emailChangeDescription: "请输入新的电子邮件地址和当前密码。确认邮件中的链接后，登录邮箱才会更改。",
  emailChangeNewEmail: "新电子邮件地址", emailChangeCurrentPassword: "当前密码", emailChangeSend: "发送确认链接", emailChangeCancel: "取消", emailChangeBack: "返回",
  emailChangePasswordRequired: "请先设置密码，再更改电子邮件地址。",
  emailChangeRequested: "确认链接已发送到新地址。确认之前，当前登录邮箱仍然有效；确认后请使用新地址登录。",
  imageHint: "可选择最大 20 MB 的图片。同步前会自动裁剪并压缩。",
  imageDecodeError: "无法打开此图片。请选择 PNG、JPEG、WebP 等受支持的图片。",
  imageEncodeError: "无法将此图片处理为头像。请尝试其他图片。",
};

const zhTW: AccountSettingsCopy = {
  profileTab: "個人資料", userId: "使用者 ID", accountCreated: "帳戶建立日期", currentPlan: "目前方案", comparePlans: "比較方案",
  freePrice: "免費", freeSummary: "免費使用 TomoNode 的基本功能。", freeBenefits: ["建立伺服器", "使用基本功能", "使用範本"],
  supporter: "Supporter", supporterPending: "價格和權益尚未確定，暫時無法付款。", currentPlanButton: "目前方案",
  copyUserId: "複製 ID", userIdCopied: "已複製", userIdCopyFailed: "無法複製使用者 ID。",
  emailChangeDescription: "請輸入新的電子郵件地址和目前密碼。開啟確認郵件中的連結後，登入信箱才會變更。",
  emailChangeNewEmail: "新的電子郵件地址", emailChangeCurrentPassword: "目前密碼", emailChangeSend: "寄送確認連結", emailChangeCancel: "取消", emailChangeBack: "返回",
  emailChangePasswordRequired: "請先設定密碼，再變更電子郵件地址。",
  emailChangeRequested: "確認連結已寄至新地址。完成確認前，目前的登入信箱仍然有效；確認後請使用新地址登入。",
  imageHint: "可選擇最大 20 MB 的圖片。同步前會自動裁剪及壓縮。",
  imageDecodeError: "無法開啟此圖片。請選擇 PNG、JPEG、WebP 等支援的圖片。",
  imageEncodeError: "無法將此圖片處理為頭像。請嘗試其他圖片。",
};

const ko: AccountSettingsCopy = {
  profileTab: "프로필", userId: "사용자 ID", accountCreated: "계정 생성일", currentPlan: "현재 요금제", comparePlans: "요금제 비교",
  freePrice: "무료", freeSummary: "TomoNode의 기본 기능을 무료로 이용할 수 있습니다.", freeBenefits: ["서버 만들기", "기본 기능 사용", "템플릿 사용"],
  supporter: "Supporter", supporterPending: "가격과 혜택은 아직 정해지지 않았습니다. 결제할 수 없습니다.", currentPlanButton: "현재 요금제",
  copyUserId: "ID 복사", userIdCopied: "복사됨", userIdCopyFailed: "사용자 ID를 복사하지 못했습니다.",
  emailChangeDescription: "새 이메일 주소와 현재 비밀번호를 입력하세요. 확인 이메일의 링크를 열기 전까지 로그인 이메일은 변경되지 않습니다.",
  emailChangeNewEmail: "새 이메일 주소", emailChangeCurrentPassword: "현재 비밀번호", emailChangeSend: "확인 링크 보내기", emailChangeCancel: "취소", emailChangeBack: "뒤로",
  emailChangePasswordRequired: "이메일 주소를 변경하기 전에 먼저 비밀번호를 설정하세요.",
  emailChangeRequested: "새 주소로 확인 링크를 보냈습니다. 확인이 완료될 때까지 현재 로그인 이메일을 계속 사용합니다. 확인 후에는 새 주소로 로그인하세요.",
  imageHint: "20 MB 이하 이미지를 선택하세요. 동기화 전에 자동으로 정사각형으로 자르고 압축합니다.",
  imageDecodeError: "이미지를 열 수 없습니다. PNG, JPEG, WebP 등 지원되는 이미지를 선택하세요.",
  imageEncodeError: "이미지를 프로필 아이콘으로 변환할 수 없습니다. 다른 이미지를 사용하세요.",
};

const es: AccountSettingsCopy = {
  profileTab: "Perfil", userId: "ID de usuario", accountCreated: "Cuenta creada", currentPlan: "Plan actual", comparePlans: "Comparar planes",
  freePrice: "Gratis", freeSummary: "Usa las funciones básicas de TomoNode sin coste.", freeBenefits: ["Crear servidores", "Usar funciones básicas", "Usar plantillas"],
  supporter: "Supporter", supporterPending: "El precio y las ventajas aún no están definidos. Los pagos no están disponibles.", currentPlanButton: "Plan actual",
  copyUserId: "Copiar ID", userIdCopied: "Copiado", userIdCopyFailed: "No se pudo copiar el ID de usuario.",
  emailChangeDescription: "Introduce el nuevo correo y tu contraseña actual. El correo de inicio de sesión solo cambiará cuando confirmes el enlace que te enviemos.",
  emailChangeNewEmail: "Nuevo correo electrónico", emailChangeCurrentPassword: "Contraseña actual", emailChangeSend: "Enviar enlace de confirmación", emailChangeCancel: "Cancelar", emailChangeBack: "Volver",
  emailChangePasswordRequired: "Configura una contraseña antes de cambiar tu correo electrónico.",
  emailChangeRequested: "Enviamos un enlace de confirmación a la nueva dirección. El correo actual seguirá activo hasta que lo confirmes; después, inicia sesión con la nueva dirección.",
  imageHint: "Elige una imagen de hasta 20 MB. Se recorta y comprime automáticamente antes de sincronizarla.",
  imageDecodeError: "No se pudo abrir la imagen. Prueba con PNG, JPEG, WebP u otro formato compatible.",
  imageEncodeError: "No se pudo preparar la imagen como icono. Prueba otra imagen.",
};

const de: AccountSettingsCopy = {
  profileTab: "Profil", userId: "Benutzer-ID", accountCreated: "Konto erstellt", currentPlan: "Aktueller Plan", comparePlans: "Pläne vergleichen",
  freePrice: "Kostenlos", freeSummary: "Nutze die Grundfunktionen von TomoNode kostenlos.", freeBenefits: ["Server erstellen", "Grundfunktionen nutzen", "Vorlagen nutzen"],
  supporter: "Supporter", supporterPending: "Preis und Vorteile stehen noch nicht fest. Zahlungen sind nicht verfügbar.", currentPlanButton: "Aktueller Plan",
  copyUserId: "ID kopieren", userIdCopied: "Kopiert", userIdCopyFailed: "Die Benutzer-ID konnte nicht kopiert werden.",
  emailChangeDescription: "Gib die neue E-Mail-Adresse und dein aktuelles Passwort ein. Die Anmelde-Adresse ändert sich erst, wenn du den Bestätigungslink öffnest.",
  emailChangeNewEmail: "Neue E-Mail-Adresse", emailChangeCurrentPassword: "Aktuelles Passwort", emailChangeSend: "Bestätigungslink senden", emailChangeCancel: "Abbrechen", emailChangeBack: "Zurück",
  emailChangePasswordRequired: "Richte zuerst ein Passwort ein, bevor du deine E-Mail-Adresse änderst.",
  emailChangeRequested: "Wir haben einen Bestätigungslink an die neue Adresse gesendet. Bis zur Bestätigung bleibt deine aktuelle Anmelde-Adresse aktiv. Melde dich danach mit der neuen Adresse an.",
  imageHint: "Wähle ein Bild bis 20 MB. Es wird vor der Synchronisierung automatisch zugeschnitten und komprimiert.",
  imageDecodeError: "Das Bild konnte nicht geöffnet werden. Versuche PNG, JPEG, WebP oder ein anderes unterstütztes Format.",
  imageEncodeError: "Das Bild konnte nicht als Profilbild vorbereitet werden. Versuche ein anderes Bild.",
};

const fr: AccountSettingsCopy = {
  profileTab: "Profil", userId: "ID utilisateur", accountCreated: "Compte créé", currentPlan: "Offre actuelle", comparePlans: "Comparer les offres",
  freePrice: "Gratuit", freeSummary: "Utilisez gratuitement les fonctions de base de TomoNode.", freeBenefits: ["Créer des serveurs", "Utiliser les fonctions de base", "Utiliser les modèles"],
  supporter: "Supporter", supporterPending: "Prix et avantages non définis. Le paiement n'est pas disponible.", currentPlanButton: "Offre actuelle",
  copyUserId: "Copier l’ID", userIdCopied: "Copié", userIdCopyFailed: "Impossible de copier l’ID utilisateur.",
  emailChangeDescription: "Saisissez la nouvelle adresse e-mail et votre mot de passe actuel. L’adresse de connexion ne changera qu’après confirmation du lien envoyé.",
  emailChangeNewEmail: "Nouvelle adresse e-mail", emailChangeCurrentPassword: "Mot de passe actuel", emailChangeSend: "Envoyer le lien de confirmation", emailChangeCancel: "Annuler", emailChangeBack: "Retour",
  emailChangePasswordRequired: "Définissez d’abord un mot de passe avant de modifier votre adresse e-mail.",
  emailChangeRequested: "Un lien de confirmation a été envoyé à la nouvelle adresse. Votre adresse actuelle reste active jusqu’à confirmation ; connectez-vous ensuite avec la nouvelle adresse.",
  imageHint: "Choisissez une image de 20 Mo maximum. Elle sera recadrée et compressée automatiquement avant la synchronisation.",
  imageDecodeError: "Impossible d'ouvrir cette image. Essayez un PNG, JPEG, WebP ou un autre format compatible.",
  imageEncodeError: "Impossible de préparer cette image comme avatar. Essayez-en une autre.",
};

const ptBR: AccountSettingsCopy = {
  profileTab: "Perfil", userId: "ID do usuário", accountCreated: "Conta criada", currentPlan: "Plano atual", comparePlans: "Comparar planos",
  freePrice: "Grátis", freeSummary: "Use gratuitamente os recursos básicos do TomoNode.", freeBenefits: ["Criar servidores", "Usar recursos básicos", "Usar modelos"],
  supporter: "Supporter", supporterPending: "Preço e benefícios ainda não definidos. Pagamentos indisponíveis.", currentPlanButton: "Plano atual",
  copyUserId: "Copiar ID", userIdCopied: "Copiado", userIdCopyFailed: "Não foi possível copiar o ID do usuário.",
  emailChangeDescription: "Digite o novo e-mail e sua senha atual. O e-mail de login só muda depois que você confirmar o link enviado.",
  emailChangeNewEmail: "Novo endereço de e-mail", emailChangeCurrentPassword: "Senha atual", emailChangeSend: "Enviar link de confirmação", emailChangeCancel: "Cancelar", emailChangeBack: "Voltar",
  emailChangePasswordRequired: "Defina uma senha antes de alterar o e-mail.",
  emailChangeRequested: "Enviamos um link de confirmação para o novo endereço. O e-mail atual continua ativo até a confirmação; depois, entre com o novo endereço.",
  imageHint: "Escolha uma imagem de até 20 MB. Ela será cortada e comprimida antes da sincronização.",
  imageDecodeError: "Não foi possível abrir a imagem. Tente PNG, JPEG, WebP ou outro formato compatível.",
  imageEncodeError: "Não foi possível preparar a imagem como ícone. Tente outra imagem.",
};

const catalogs: Record<AppLocale, AccountSettingsCopy> = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, ko, es, de, fr, "pt-BR": ptBR };

export function accountSettingsText(locale: AppLocale): AccountSettingsCopy {
  return catalogs[locale];
}
