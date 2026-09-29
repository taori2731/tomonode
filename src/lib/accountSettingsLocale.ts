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
  currentDevice: string;
  devicesPending: string;
  imageHint: string;
  imageDecodeError: string;
  imageEncodeError: string;
}

const en: AccountSettingsCopy = {
  profileTab: "Profile", userId: "User ID", accountCreated: "Account created", currentPlan: "Current plan", comparePlans: "Compare plans",
  freePrice: "Free", freeSummary: "Use TomoNode's basic features at no cost.", freeBenefits: ["Create servers", "Use the basic features", "Use templates"],
  supporter: "Supporter", supporterPending: "Pricing and benefits are not available yet.", currentPlanButton: "Current plan",
  currentDevice: "This device", devicesPending: "The device list is not available yet.",
  imageHint: "Choose an image up to 20 MB. TomoNode crops and compresses it automatically before syncing.",
  imageDecodeError: "This image could not be opened. Try a PNG, JPEG, WebP, or another supported image.",
  imageEncodeError: "This image could not be prepared as an icon. Try a different image.",
};

const ja: AccountSettingsCopy = {
  profileTab: "プロフィール", userId: "ユーザーID", accountCreated: "アカウント作成日", currentPlan: "現在のプラン", comparePlans: "プランの比較",
  freePrice: "¥0／月", freeSummary: "TomoNodeの基本機能を無料で利用できます。", freeBenefits: ["サーバーを作成", "基本機能を利用", "テンプレートを利用"],
  supporter: "Supporter", supporterPending: "料金・特典は未定です。決済はまだ利用できません。", currentPlanButton: "現在のプラン",
  currentDevice: "この端末", devicesPending: "端末一覧は準備中です。",
  imageHint: "20 MBまでの画像を選べます。正方形に切り抜き・圧縮してから同期します。",
  imageDecodeError: "画像を読み込めませんでした。PNG・JPEG・WebPなどの画像を選んでください。",
  imageEncodeError: "画像をアイコン用に変換できませんでした。別の画像を試してください。",
};

const zhCN: AccountSettingsCopy = {
  profileTab: "个人资料", userId: "用户 ID", accountCreated: "账户创建日期", currentPlan: "当前方案", comparePlans: "比较方案",
  freePrice: "免费", freeSummary: "免费使用 TomoNode 的基本功能。", freeBenefits: ["创建服务器", "使用基本功能", "使用模板"],
  supporter: "Supporter", supporterPending: "价格和权益尚未确定，暂不能付款。", currentPlanButton: "当前方案",
  currentDevice: "此设备", devicesPending: "设备列表尚未开放。",
  imageHint: "可选择最大 20 MB 的图片。同步前会自动裁剪并压缩。",
  imageDecodeError: "无法打开此图片。请选择 PNG、JPEG、WebP 等受支持的图片。",
  imageEncodeError: "无法将此图片处理为头像。请尝试其他图片。",
};

const zhTW: AccountSettingsCopy = {
  profileTab: "個人資料", userId: "使用者 ID", accountCreated: "帳戶建立日期", currentPlan: "目前方案", comparePlans: "比較方案",
  freePrice: "免費", freeSummary: "免費使用 TomoNode 的基本功能。", freeBenefits: ["建立伺服器", "使用基本功能", "使用範本"],
  supporter: "Supporter", supporterPending: "價格和權益尚未確定，暫時無法付款。", currentPlanButton: "目前方案",
  currentDevice: "此裝置", devicesPending: "裝置清單尚未開放。",
  imageHint: "可選擇最大 20 MB 的圖片。同步前會自動裁剪及壓縮。",
  imageDecodeError: "無法開啟此圖片。請選擇 PNG、JPEG、WebP 等支援的圖片。",
  imageEncodeError: "無法將此圖片處理為頭像。請嘗試其他圖片。",
};

const ko: AccountSettingsCopy = {
  profileTab: "프로필", userId: "사용자 ID", accountCreated: "계정 생성일", currentPlan: "현재 요금제", comparePlans: "요금제 비교",
  freePrice: "무료", freeSummary: "TomoNode의 기본 기능을 무료로 이용할 수 있습니다.", freeBenefits: ["서버 만들기", "기본 기능 사용", "템플릿 사용"],
  supporter: "Supporter", supporterPending: "가격과 혜택은 아직 정해지지 않았습니다. 결제할 수 없습니다.", currentPlanButton: "현재 요금제",
  currentDevice: "이 기기", devicesPending: "기기 목록은 준비 중입니다.",
  imageHint: "20 MB 이하 이미지를 선택하세요. 동기화 전에 자동으로 정사각형으로 자르고 압축합니다.",
  imageDecodeError: "이미지를 열 수 없습니다. PNG, JPEG, WebP 등 지원되는 이미지를 선택하세요.",
  imageEncodeError: "이미지를 프로필 아이콘으로 변환할 수 없습니다. 다른 이미지를 사용하세요.",
};

const es: AccountSettingsCopy = {
  profileTab: "Perfil", userId: "ID de usuario", accountCreated: "Cuenta creada", currentPlan: "Plan actual", comparePlans: "Comparar planes",
  freePrice: "Gratis", freeSummary: "Usa las funciones básicas de TomoNode sin coste.", freeBenefits: ["Crear servidores", "Usar funciones básicas", "Usar plantillas"],
  supporter: "Supporter", supporterPending: "El precio y las ventajas aún no están definidos. Los pagos no están disponibles.", currentPlanButton: "Plan actual",
  currentDevice: "Este dispositivo", devicesPending: "La lista de dispositivos aún no está disponible.",
  imageHint: "Elige una imagen de hasta 20 MB. Se recorta y comprime automáticamente antes de sincronizarla.",
  imageDecodeError: "No se pudo abrir la imagen. Prueba con PNG, JPEG, WebP u otro formato compatible.",
  imageEncodeError: "No se pudo preparar la imagen como icono. Prueba otra imagen.",
};

const de: AccountSettingsCopy = {
  profileTab: "Profil", userId: "Benutzer-ID", accountCreated: "Konto erstellt", currentPlan: "Aktueller Plan", comparePlans: "Pläne vergleichen",
  freePrice: "Kostenlos", freeSummary: "Nutze die Grundfunktionen von TomoNode kostenlos.", freeBenefits: ["Server erstellen", "Grundfunktionen nutzen", "Vorlagen nutzen"],
  supporter: "Supporter", supporterPending: "Preis und Vorteile stehen noch nicht fest. Zahlungen sind nicht verfügbar.", currentPlanButton: "Aktueller Plan",
  currentDevice: "Dieses Gerät", devicesPending: "Die Geräteliste ist noch nicht verfügbar.",
  imageHint: "Wähle ein Bild bis 20 MB. Es wird vor der Synchronisierung automatisch zugeschnitten und komprimiert.",
  imageDecodeError: "Das Bild konnte nicht geöffnet werden. Versuche PNG, JPEG, WebP oder ein anderes unterstütztes Format.",
  imageEncodeError: "Das Bild konnte nicht als Profilbild vorbereitet werden. Versuche ein anderes Bild.",
};

const fr: AccountSettingsCopy = {
  profileTab: "Profil", userId: "ID utilisateur", accountCreated: "Compte créé", currentPlan: "Offre actuelle", comparePlans: "Comparer les offres",
  freePrice: "Gratuit", freeSummary: "Utilisez gratuitement les fonctions de base de TomoNode.", freeBenefits: ["Créer des serveurs", "Utiliser les fonctions de base", "Utiliser les modèles"],
  supporter: "Supporter", supporterPending: "Prix et avantages non définis. Le paiement n'est pas disponible.", currentPlanButton: "Offre actuelle",
  currentDevice: "Cet appareil", devicesPending: "La liste des appareils n'est pas encore disponible.",
  imageHint: "Choisissez une image de 20 Mo maximum. Elle sera recadrée et compressée automatiquement avant la synchronisation.",
  imageDecodeError: "Impossible d'ouvrir cette image. Essayez un PNG, JPEG, WebP ou un autre format compatible.",
  imageEncodeError: "Impossible de préparer cette image comme avatar. Essayez-en une autre.",
};

const ptBR: AccountSettingsCopy = {
  profileTab: "Perfil", userId: "ID do usuário", accountCreated: "Conta criada", currentPlan: "Plano atual", comparePlans: "Comparar planos",
  freePrice: "Grátis", freeSummary: "Use gratuitamente os recursos básicos do TomoNode.", freeBenefits: ["Criar servidores", "Usar recursos básicos", "Usar modelos"],
  supporter: "Supporter", supporterPending: "Preço e benefícios ainda não definidos. Pagamentos indisponíveis.", currentPlanButton: "Plano atual",
  currentDevice: "Este dispositivo", devicesPending: "A lista de dispositivos ainda não está disponível.",
  imageHint: "Escolha uma imagem de até 20 MB. Ela será cortada e comprimida antes da sincronização.",
  imageDecodeError: "Não foi possível abrir a imagem. Tente PNG, JPEG, WebP ou outro formato compatível.",
  imageEncodeError: "Não foi possível preparar a imagem como ícone. Tente outra imagem.",
};

const catalogs: Record<AppLocale, AccountSettingsCopy> = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, ko, es, de, fr, "pt-BR": ptBR };

export function accountSettingsText(locale: AppLocale): AccountSettingsCopy {
  return catalogs[locale];
}
