import type { AppLocale } from "./i18n";
import { brand } from "./brand";
import { planCopies } from "./planLocale";

export type SupporterCopy = {
  advancedOperationsTitle: string;
  advancedOperationsBody: string;
  title: string;
  intro: string;
  freeKicker: string;
  freeTitle: string;
  freeFeatures: readonly string[];
  candidateKicker: string;
  candidateTitle: string;
  candidateFeatures: readonly string[];
  pendingTitle: string;
  pendingBody: string;
  availableTitle: string;
  availableBody: string;
  supportButton: string;
  monthlyPrice: string;
  afterStoppingBody: string;
};

const copies: Record<AppLocale, SupporterCopy> = {
  ja: {
    advancedOperationsTitle: "高度な運用",
    advancedOperationsBody: "複数サーバーの状態、操作、監視、履歴、Mod構成、外観を一か所で管理します。これらの機能は支援の有無にかかわらず利用できます。",
    title: `${brand.productName}を応援`,
    intro: "支援は任意です。安定して提供している機能と安全機能は、これからも全員が無料で利用できます。",
    freeKicker: "全員に提供",
    freeTitle: "安定機能と安全機能",
    freeFeatures: [
      "すべての安定機能と安全機能",
      "バックアップ・復元と変更前の安全バックアップ",
      "サーバーデータへのアクセス、保存、取り込み",
    ],
    candidateKicker: "応援で検討する候補",
    candidateTitle: "将来の参加方法",
    candidateFeatures: [
      "将来追加する新機能の先行体験",
      "開発中の機能へのフィードバック参加",
      "限定デザインやアイコンなどの外観",
    ],
    pendingTitle: "Stripeの応援プランは準備中",
    pendingBody: "月額500円を予定しています。特典と決済設定の準備が整い次第、受付を開始します。このアプリでカード情報を入力・保存することはありません。",
    availableTitle: "Stripeの月額応援プラン",
    availableBody: "アカウントにログインしてStripeで申し込みます。料金と請求条件は決済前に確認でき、解約・支払い方法の変更はStripeで行えます。",
    supportButton: "Stripeで応援プランに申し込む",
    monthlyPrice: "月額 {amount}（予定）",
    afterStoppingBody: "支援を停止した後も、安全機能、バックアップと復元、サーバーデータへのアクセスを制限しません。",
  },
  en: {
    advancedOperationsTitle: "Advanced operations",
    advancedOperationsBody: "Manage multiple servers’ status, controls, monitoring, history, modpack profiles, and appearance in one place. These features are available regardless of whether you support the project.",
    title: `Support ${brand.productName}`,
    intro: "Support is optional. Stable and safety features will remain free for everyone.",
    freeKicker: "For everyone",
    freeTitle: "Stable and safety features",
    freeFeatures: [
      "All stable and safety features",
      "Backup, restore, and pre-change safety backups",
      "Access to, storage of, and import of server data",
    ],
    candidateKicker: "Possible ways to support",
    candidateTitle: "Future supporter options",
    candidateFeatures: [
      "Early access to new features added in the future",
      "Participation in feedback for features in development",
      "Limited designs, icons, and other appearance options",
    ],
    pendingTitle: "Stripe supporter plan is being prepared",
    pendingBody: "A JPY 500 monthly plan is planned. Enrollment will open when benefits and payment setup are ready. This app does not collect or store card details.",
    availableTitle: "Monthly supporter plan with Stripe",
    availableBody: "Sign in to your account to subscribe through Stripe. Review pricing and billing terms before paying, and manage cancellation and payment methods in Stripe.",
    supportButton: "Subscribe with Stripe",
    monthlyPrice: "{amount} / month (planned)",
    afterStoppingBody: "Stopping support will not restrict safety tools, backup and restore, or access to server data.",
  },
  de: {
    advancedOperationsTitle: "Erweiterter Betrieb",
    advancedOperationsBody: "Verwalten Sie Status, Aktionen, Überwachung, Verlauf, Modpack-Profile und Darstellung mehrerer Server an einem Ort. Diese Funktionen sind unabhängig davon verfügbar, ob Sie das Projekt unterstützen.",
    title: `${brand.productName} unterstützen`,
    intro: "Unterstützung ist freiwillig. Stabile und sicherheitsrelevante Funktionen bleiben für alle kostenlos.",
    freeKicker: "Für alle",
    freeTitle: "Stabile und sichere Funktionen",
    freeFeatures: [
      "Alle stabilen und sicherheitsrelevanten Funktionen",
      "Sicherung, Wiederherstellung und Sicherung vor Änderungen",
      "Zugriff auf, Speicherung und Import von Serverdaten",
    ],
    candidateKicker: "Mögliche Formen der Unterstützung",
    candidateTitle: "Optionen für die Zukunft",
    candidateFeatures: [
      "Früher Zugang zu künftig hinzugefügten Funktionen",
      "Feedback zu Funktionen in Entwicklung",
      "Exklusive Designs, Symbole und andere Darstellungsoptionen",
    ],
    pendingTitle: "Stripe-Unterstützerabo in Vorbereitung",
    pendingBody: "Ein Monatsabo für 500 JPY ist geplant. Die Anmeldung beginnt, sobald Vorteile und Zahlungsabwicklung bereit sind. Diese App erfasst oder speichert keine Kartendaten.",
    availableTitle: "Monatliches Unterstützerabo mit Stripe",
    availableBody: "Melde dich an, um das Abo über Stripe abzuschließen. Preis und Bedingungen werden vor der Zahlung angezeigt. Kündigung und Zahlungsmethoden verwaltest du bei Stripe.",
    supportButton: "Abo über Stripe abschließen",
    monthlyPrice: "{amount} / Monat (geplant)",
    afterStoppingBody: "Das Beenden der Unterstützung schränkt Sicherheitsfunktionen, Sicherung und Wiederherstellung oder den Zugriff auf Serverdaten nicht ein.",
  },
  es: {
    advancedOperationsTitle: "Operaciones avanzadas",
    advancedOperationsBody: "Gestiona en un solo lugar el estado, las acciones, la supervisión, el historial, los perfiles de modpacks y la apariencia de varios servidores. Estas funciones están disponibles independientemente de que apoyes el proyecto.",
    title: `Apoyar a ${brand.productName}`,
    intro: "El apoyo es opcional. Las funciones estables y de seguridad seguirán siendo gratuitas para todos.",
    freeKicker: "Para todos",
    freeTitle: "Funciones estables y de seguridad",
    freeFeatures: [
      "Todas las funciones estables y de seguridad",
      "Copias de seguridad, restauración y copia previa a los cambios",
      "Acceso, almacenamiento e importación de datos del servidor",
    ],
    candidateKicker: "Posibles formas de apoyar",
    candidateTitle: "Opciones futuras para quienes apoyen",
    candidateFeatures: [
      "Acceso anticipado a nuevas funciones que se añadan en el futuro",
      "Participación en los comentarios sobre funciones en desarrollo",
      "Diseños, iconos y otras opciones visuales limitadas",
    ],
    pendingTitle: "El plan de apoyo con Stripe está en preparación",
    pendingBody: "Se prevé un plan mensual de 500 JPY. Las suscripciones comenzarán cuando las ventajas y el pago estén listos. Esta aplicación no recopila ni guarda datos de tarjeta.",
    availableTitle: "Plan de apoyo mensual con Stripe",
    availableBody: "Inicia sesión para suscribirte con Stripe. Consulta el precio y las condiciones antes de pagar. Gestiona la cancelación y los métodos de pago en Stripe.",
    supportButton: "Suscribirse con Stripe",
    monthlyPrice: "{amount} / mes (previsto)",
    afterStoppingBody: "Dejar de apoyar no limitará las herramientas de seguridad, las copias y restauraciones ni el acceso a los datos del servidor.",
  },
  fr: {
    advancedOperationsTitle: "Opérations avancées",
    advancedOperationsBody: "Gérez au même endroit l’état, les actions, la surveillance, l’historique, les profils de modpacks et l’apparence de plusieurs serveurs. Ces fonctions restent accessibles que vous souteniez le projet ou non.",
    title: `Soutenir ${brand.productName}`,
    intro: "Le soutien est facultatif. Les fonctions stables et de sécurité resteront gratuites pour tout le monde.",
    freeKicker: "Pour tout le monde",
    freeTitle: "Fonctions stables et de sécurité",
    freeFeatures: [
      "Toutes les fonctions stables et de sécurité",
      "Sauvegarde, restauration et sauvegarde avant modification",
      "Accès, stockage et importation des données du serveur",
    ],
    candidateKicker: "Possibilités de soutien envisagées",
    candidateTitle: "Options futures pour les soutiens",
    candidateFeatures: [
      "Accès anticipé aux nouvelles fonctions ajoutées à l’avenir",
      "Participation aux retours sur les fonctions en développement",
      "Designs, icônes et autres options d’apparence limitées",
    ],
    pendingTitle: "L’abonnement de soutien Stripe est en préparation",
    pendingBody: "Un abonnement mensuel de 500 JPY est prévu. Les inscriptions ouvriront lorsque les avantages et le paiement seront prêts. Cette application ne recueille ni ne stocke de données de carte.",
    availableTitle: "Abonnement de soutien mensuel avec Stripe",
    availableBody: "Connectez-vous pour vous abonner avec Stripe. Vérifiez le prix et les conditions avant de payer. Gérez la résiliation et les moyens de paiement dans Stripe.",
    supportButton: "S’abonner avec Stripe",
    monthlyPrice: "{amount} / mois (prévu)",
    afterStoppingBody: "L’arrêt du soutien ne limitera ni les outils de sécurité, ni la sauvegarde et la restauration, ni l’accès aux données du serveur.",
  },
  ko: {
    advancedOperationsTitle: "고급 운영",
    advancedOperationsBody: "여러 서버의 상태, 작업, 모니터링, 기록, 모드팩 프로필과 외관을 한곳에서 관리합니다. 프로젝트 후원 여부와 관계없이 이 기능을 사용할 수 있습니다.",
    title: `${brand.productName} 응원하기`,
    intro: "응원은 선택 사항입니다. 안정 기능과 안전 기능은 앞으로도 모두에게 무료로 제공됩니다.",
    freeKicker: "모두에게 제공",
    freeTitle: "안정 기능 및 안전 기능",
    freeFeatures: [
      "모든 안정 기능 및 안전 기능",
      "백업, 복원 및 변경 전 안전 백업",
      "서버 데이터의 접근, 저장 및 가져오기",
    ],
    candidateKicker: "응원으로 검토할 항목",
    candidateTitle: "향후 응원자 선택 사항",
    candidateFeatures: [
      "앞으로 추가될 새 기능의 사전 체험",
      "개발 중인 기능에 대한 피드백 참여",
      "한정 디자인, 아이콘 및 기타 외관 옵션",
    ],
    pendingTitle: "Stripe 응원 플랜 준비 중",
    pendingBody: "월 500엔을 예정하고 있습니다. 혜택과 결제 설정 준비가 완료되면 신청을 받습니다. 이 앱은 카드 정보를 수집하거나 저장하지 않습니다.",
    availableTitle: "Stripe 월간 응원 플랜",
    availableBody: "계정에 로그인하여 Stripe에서 신청합니다. 결제 전에 요금과 청구 조건을 확인하고 Stripe에서 해지와 결제 수단을 관리할 수 있습니다.",
    supportButton: "Stripe에서 응원 플랜 신청",
    monthlyPrice: "월 {amount} (예정)",
    afterStoppingBody: "응원을 중단해도 안전 기능, 백업과 복원 또는 서버 데이터 접근을 제한하지 않습니다.",
  },
  "pt-BR": {
    advancedOperationsTitle: "Operações avançadas",
    advancedOperationsBody: "Gerencie em um só lugar o status, as ações, o monitoramento, o histórico, os perfis de modpack e a aparência de vários servidores. Esses recursos estão disponíveis independentemente do seu apoio ao projeto.",
    title: `Apoie o ${brand.productName}`,
    intro: "O apoio é opcional. Os recursos estáveis e de segurança continuarão gratuitos para todos.",
    freeKicker: "Para todos",
    freeTitle: "Recursos estáveis e de segurança",
    freeFeatures: [
      "Todos os recursos estáveis e de segurança",
      "Backup, restauração e backup de segurança antes de alterações",
      "Acesso, armazenamento e importação de dados do servidor",
    ],
    candidateKicker: "Possíveis formas de apoiar",
    candidateTitle: "Opções futuras para apoiadores",
    candidateFeatures: [
      "Acesso antecipado a novos recursos adicionados no futuro",
      "Participação em feedback sobre recursos em desenvolvimento",
      "Designs, ícones e outras opções visuais limitadas",
    ],
    pendingTitle: "O plano de apoio com Stripe está em preparação",
    pendingBody: "Está previsto um plano mensal de 500 JPY. As inscrições abrirão quando os benefícios e o pagamento estiverem prontos. Este aplicativo não coleta nem armazena dados de cartão.",
    availableTitle: "Plano de apoio mensal com Stripe",
    availableBody: "Entre na conta para assinar com Stripe. Confira o preço e as condições antes de pagar. Gerencie cancelamento e formas de pagamento no Stripe.",
    supportButton: "Assinar com Stripe",
    monthlyPrice: "{amount} / mês (previsto)",
    afterStoppingBody: "Interromper o apoio não limitará as ferramentas de segurança, o backup e a restauração ou o acesso aos dados do servidor.",
  },
  "zh-CN": {
    advancedOperationsTitle: "高级运维",
    advancedOperationsBody: "在一个地方管理多个服务器的状态、操作、监控、历史记录、Mod 包配置和外观。无论是否支持项目，都可以使用这些功能。",
    title: `支持 ${brand.productName}`,
    intro: "支持是自愿的。稳定功能和安全功能今后也会向所有人免费提供。",
    freeKicker: "面向所有人",
    freeTitle: "稳定功能和安全功能",
    freeFeatures: [
      "所有稳定功能和安全功能",
      "备份、恢复以及修改前的安全备份",
      "访问、保存和导入服务器数据",
    ],
    candidateKicker: "支持项目后考虑的候选内容",
    candidateTitle: "未来支持者选项",
    candidateFeatures: [
      "提前体验未来新增功能",
      "参与开发中功能的反馈",
      "限定设计、图标和其他外观选项",
    ],
    pendingTitle: "Stripe 支持计划正在准备中",
    pendingBody: "计划每月500日元。权益和支付配置准备就绪后开放订阅。本应用不会收集或存储银行卡信息。",
    availableTitle: "Stripe 每月支持计划",
    availableBody: "登录账户后通过 Stripe 订阅。付款前可查看价格和账单条款，并通过 Stripe 管理取消订阅和付款方式。",
    supportButton: "通过 Stripe 订阅支持计划",
    monthlyPrice: "每月 {amount}（计划）",
    afterStoppingBody: "停止支持后，安全功能、备份与恢复以及服务器数据访问都不会受到限制。",
  },
  "zh-TW": {
    advancedOperationsTitle: "進階運作",
    advancedOperationsBody: "在同一處管理多個伺服器的狀態、操作、監控、歷史記錄、Mod 套件設定與外觀。無論是否支持專案，都可以使用這些功能。",
    title: `支持 ${brand.productName}`,
    intro: "支持是自願的。穩定功能與安全功能今後也會向所有人免費提供。",
    freeKicker: "提供給所有人",
    freeTitle: "穩定功能與安全功能",
    freeFeatures: [
      "所有穩定功能與安全功能",
      "備份、還原與變更前的安全備份",
      "存取、儲存與匯入伺服器資料",
    ],
    candidateKicker: "支持專案時考慮的候選內容",
    candidateTitle: "未來支持者選項",
    candidateFeatures: [
      "提前體驗未來新增功能",
      "參與開發中功能的意見回饋",
      "限定設計、圖示與其他外觀選項",
    ],
    pendingTitle: "Stripe 支持方案準備中",
    pendingBody: "預計每月500日圓。權益和付款設定準備完成後開放訂閱。本應用程式不會收集或儲存信用卡資訊。",
    availableTitle: "Stripe 每月支持方案",
    availableBody: "登入帳戶後透過 Stripe 訂閱。付款前可查看價格與帳單條款，並透過 Stripe 管理取消訂閱和付款方式。",
    supportButton: "透過 Stripe 訂閱支持方案",
    monthlyPrice: "每月 {amount}（預計）",
    afterStoppingBody: "停止支持後，安全功能、備份與還原以及伺服器資料存取都不會受到限制。",
  },
};

export function supporterText(locale: AppLocale) {
  return { ...copies[locale], ...planCopies[locale] };
}
