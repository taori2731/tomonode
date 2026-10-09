import type { AppLocale } from "./i18n";
import { brand } from "./brand";
import packageMetadata from "../../package.json";

export const CURRENT_RELEASE_NEWS_VERSION = packageMetadata.version;

export type ReleaseAnnouncement = Readonly<{
  id: string;
  date: string;
  tag: "APP" | "FIX" | "MOD";
  title: string;
  body: string;
}>;

type ReleaseNewsCopy = Readonly<{
  currentTitle: string;
  currentBody: string;
  previousTitle: string;
  previousBody: string;
  olderTitle: string;
  olderBody: string;
}>;

const copy: Record<AppLocale, ReleaseNewsCopy> = {
  ja: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 購入受付と契約管理を分離`,
    currentBody: "新規購入は受付が明示的に許可されている場合だけ利用でき、Stripeを開く直前にも再確認します。新規販売が停止中でも、接続が有効な既存契約の管理と手動の会員状態再確認は維持します。本番購入は引き続き準備中です。",
    previousTitle: `${brand.productName} 0.5.1 — コンソール履歴の上限を解除`,
    previousBody: "コンソールの表示・保持・IPC返却にあった固定行数上限をなくし、500行を超えるログも先頭から検索・コピー・保存できるようにしました。同じログの再比較を省略し、画面外の背景サーバー監視を停止、ログ行とサーバーカードの再描画も抑制します。保存形式、サーバー機能、画面の見た目は変更していません。",
    olderTitle: `${brand.productName} 0.5.0 — 監視とログ表示を軽量化`,
    olderBody: "同じログの再比較を省略し、画面外の背景サーバー監視を停止しました。ログ行とサーバーカードの再描画を抑制して、サーバー稼働中のUI操作と長時間のコンソール表示を軽くしています。保存形式、サーバー機能、画面の見た目は変更していません。",
  },
  en: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Separate purchase availability from subscription management`,
    currentBody: "New purchases require explicit permission, checked again before opening Stripe. When new sales are paused, existing subscription management and manual membership recovery remain available if the connection is enabled. Production purchases are still being prepared.",
    previousTitle: `${brand.productName} 0.5.1 — Unlimited console history`,
    previousBody: "The fixed limits on console display, Rust retention, and IPC results are removed: logs beyond 500 rows remain available for search, copy, and save. Unchanged polled snapshots are reused, background monitoring pauses outside server workspaces, and unchanged rows and server cards avoid redundant renders. Saved data, server features, and the visual design remain compatible.",
    olderTitle: `${brand.productName} 0.5.0 — Lighter monitoring and console rendering`,
    olderBody: "Unchanged polled log snapshots are now reused, background server monitoring pauses outside server workspaces, and unchanged console rows and home server cards avoid redundant renders. This keeps server controls and long-running console views more responsive without changing saved data, server features, or the visual design.",
  },
  "zh-CN": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 区分购买开放状态与订阅管理`,
    currentBody: "只有明确允许购买时才能开始新购买，并在打开 Stripe 前再次确认。暂停新销售时，只要连接有效，现有订阅管理和手动会员状态核对仍可使用。正式购买仍在准备中。",
    previousTitle: `${brand.productName} 0.5.1 — 解除控制台历史上限`,
    previousBody: "移除了控制台显示、Rust 保留和 IPC 返回结果的固定行数限制；超过 500 行的日志也可以从开头搜索、复制和保存。未变化的轮询结果会复用，非服务器工作区会暂停后台监控，并减少未变化日志行和服务器卡片的重复渲染。保存数据、服务器功能和视觉设计保持兼容。",
    olderTitle: `${brand.productName} 0.5.0 — 减轻监控与日志渲染`,
    olderBody: "现在会复用未变化的日志轮询结果，在非服务器工作区暂停后台服务器监控，并避免重复渲染未变化的日志行和主页服务器卡片。这样可以提升服务器运行中和长时间查看控制台时的响应，同时不改变保存数据、服务器功能或视觉设计。",
  },
  "zh-TW": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 區分購買開放狀態與訂閱管理`,
    currentBody: "只有明確允許購買時才能開始新購買，並在開啟 Stripe 前再次確認。暫停新銷售時，只要連線有效，既有訂閱管理和手動會員狀態核對仍可使用。正式購買仍在準備中。",
    previousTitle: `${brand.productName} 0.5.1 — 解除主控台日誌上限`,
    previousBody: "移除主控台顯示、Rust 保留與 IPC 回傳結果的固定行數限制；超過 500 行的日誌也能從開頭搜尋、複製與儲存。未變更的輪詢結果會重用，非伺服器工作區會暫停背景監控，並減少未變更日誌列與伺服器卡片的重複渲染。儲存資料、伺服器功能與視覺設計保持相容。",
    olderTitle: `${brand.productName} 0.5.0 — 減輕監控與日誌渲染`,
    olderBody: "現在會重用未變更的日誌輪詢結果，在非伺服器工作區暫停背景伺服器監控，並避免重複渲染未變更的日誌列與首頁伺服器卡片。這能改善伺服器運行中與長時間查看控制台時的回應，同時不改變儲存資料、伺服器功能或視覺設計。",
  },
  ko: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 신규 구매와 구독 관리 분리`,
    currentBody: "신규 구매는 명시적으로 허용된 경우에만 시작할 수 있으며 Stripe를 열기 직전에 다시 확인합니다. 신규 판매가 중단되어도 연결이 활성화되어 있으면 기존 구독 관리와 수동 회원 상태 확인은 계속 사용할 수 있습니다. 실제 구매는 아직 준비 중입니다.",
    previousTitle: `${brand.productName} 0.5.1 — 콘솔 기록 제한 해제`,
    previousBody: "콘솔 표시, Rust 보관, IPC 결과에 있던 고정 줄 수 제한을 제거했습니다. 500줄을 넘는 로그도 처음부터 검색하고 복사하고 저장할 수 있습니다. 변경되지 않은 폴링 결과를 재사용하고, 서버 작업 영역 밖의 백그라운드 감시를 멈추며, 변경되지 않은 로그 행과 서버 카드의 중복 렌더링을 줄였습니다. 저장 데이터와 서버 기능, 화면 디자인은 호환됩니다.",
    olderTitle: `${brand.productName} 0.5.0 — 모니터링과 콘솔 렌더링 경량화`,
    olderBody: "변하지 않은 로그 폴링 결과를 재사용하고, 서버 작업 영역 밖에서는 백그라운드 서버 감시를 중지하며, 변하지 않은 로그 행과 홈 서버 카드의 중복 렌더링을 줄였습니다. 저장 데이터, 서버 기능, 화면 디자인은 변경하지 않고 서버 실행 중과 장시간 콘솔 사용의 반응성을 높입니다.",
  },
  es: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Separar las nuevas compras de la gestión de suscripciones`,
    currentBody: "Las nuevas compras requieren permiso explícito, que se comprueba de nuevo antes de abrir Stripe. Si se pausan las ventas, la gestión de suscripciones existentes y la recuperación manual del estado de miembro siguen disponibles cuando la conexión está habilitada. Las compras reales aún están en preparación.",
    previousTitle: `${brand.productName} 0.5.1 — Historial de consola sin límite fijo`,
    previousBody: "Se eliminaron los límites fijos de filas para la consola, la retención en Rust y los resultados IPC. Los registros de más de 500 filas siguen disponibles para buscar, copiar y guardar desde el principio. Se reutilizan los sondeos sin cambios, se pausa la supervisión en segundo plano fuera de las áreas de servidor y se evitan renderizados repetidos. Los datos guardados y las funciones del servidor siguen siendo compatibles.",
    olderTitle: `${brand.productName} 0.5.0 — Supervisión y consola más ligeras`,
    olderBody: "Se reutilizan los resultados de sondeos de registro sin cambios, se pausa la supervisión de servidores en segundo plano fuera de las áreas de servidor y se evitan renderizados repetidos de filas de registro y tarjetas sin cambios. La respuesta mejora sin cambiar los datos guardados, las funciones del servidor ni el diseño visual.",
  },
  de: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Neue Käufe und Abonnementverwaltung getrennt`,
    currentBody: "Neue Käufe benötigen eine ausdrückliche Freigabe, die vor dem Öffnen von Stripe erneut geprüft wird. Bei pausierten Verkäufen bleiben bestehende Abonnements und die manuelle Mitgliedschaftsabfrage bei aktiver Verbindung verwaltbar. Käufe im Produktivbetrieb werden noch vorbereitet.",
    previousTitle: `${brand.productName} 0.5.1 — Unbegrenzter Konsolenverlauf`,
    previousBody: "Die festen Zeilenlimits für Konsolenanzeige, Rust-Aufbewahrung und IPC-Ergebnisse wurden entfernt. Auch Protokolle mit mehr als 500 Zeilen bleiben von Anfang an durchsuchbar, kopierbar und speicherbar. Unveränderte Abfragen werden wiederverwendet, die Hintergrundüberwachung außerhalb der Serverbereiche pausiert und doppelte Renderings werden vermieden. Gespeicherte Daten und Serverfunktionen bleiben kompatibel.",
    olderTitle: `${brand.productName} 0.5.0 — Leichtere Überwachung und Konsolenanzeige`,
    olderBody: "Unveränderte Log-Abfrageergebnisse werden wiederverwendet, die Hintergrundüberwachung außerhalb der Serverbereiche pausiert, und redundante Renderings unveränderter Logzeilen und Serverkarten werden vermieden. Gespeicherte Daten, Serverfunktionen und das visuelle Design bleiben unverändert, während die Bedienung reaktionsschneller wird.",
  },
  fr: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Séparer les nouveaux achats de la gestion des abonnements`,
    currentBody: "Les nouveaux achats nécessitent une autorisation explicite, vérifiée à nouveau avant d’ouvrir Stripe. Lorsque les ventes sont suspendues, la gestion des abonnements existants et la vérification manuelle du statut restent disponibles si la connexion est activée. Les achats réels sont encore en préparation.",
    previousTitle: `${brand.productName} 0.5.1 — Historique de console sans limite fixe`,
    previousBody: "Les limites fixes de lignes pour l'affichage de la console, la rétention Rust et les résultats IPC sont supprimées. Les journaux de plus de 500 lignes restent disponibles depuis le début pour la recherche, la copie et l'enregistrement. Les sondages inchangés sont réutilisés, la surveillance en arrière-plan est suspendue hors des espaces serveur et les rendus répétés sont évités. Les données enregistrées et les fonctions du serveur restent compatibles.",
    olderTitle: `${brand.productName} 0.5.0 — Surveillance et console plus légères`,
    olderBody: "Les résultats de sondage des journaux inchangés sont réutilisés, la surveillance des serveurs en arrière-plan est suspendue hors des espaces serveur, et les rendus répétés des lignes et cartes inchangées sont évités. Les données enregistrées, les fonctions du serveur et l'apparence restent inchangées pour une interface plus réactive.",
  },
  "pt-BR": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Separar novas compras da gestão de assinaturas`,
    currentBody: "Novas compras exigem permissão explícita, verificada novamente antes de abrir o Stripe. Quando as vendas estão pausadas, a gestão de assinaturas existentes e a verificação manual do status continuam disponíveis se a conexão estiver habilitada. As compras reais ainda estão em preparação.",
    previousTitle: `${brand.productName} 0.5.1 — Histórico do console sem limite fixo`,
    previousBody: "Removemos os limites fixos de linhas da exibição do console, da retenção em Rust e dos resultados IPC. Logs com mais de 500 linhas continuam disponíveis desde o início para pesquisar, copiar e salvar. Resultados de sondagens sem alterações são reutilizados, o monitoramento em segundo plano pausa fora das áreas de servidor e renderizações repetidas são evitadas. Os dados salvos e os recursos do servidor continuam compatíveis.",
    olderTitle: `${brand.productName} 0.5.0 — Monitoramento e console mais leves`,
    olderBody: "Resultados de sondagens de logs sem alterações são reutilizados, o monitoramento de servidores em segundo plano é pausado fora das áreas de servidor e renderizações repetidas de linhas e cartões sem alterações são evitadas. Os dados salvos, os recursos do servidor e o design visual permanecem iguais, com uma interface mais responsiva.",
  },
};

const preparationCopy: Record<AppLocale, { title: string; body: string }> = {
  ja: { title: "会員資格の準備中表示を修正", body: "Stripeの本番接続が未準備の場合は、通信失敗ではなく接続準備中と表示します。手動の再確認でも誤った失敗警告を出しません。新規購入は引き続き無効で、有料特典は付与しません。" },
  en: { title: "Clarify membership preparation status", body: "When production Stripe billing is not configured, membership shows a preparation status instead of a connection failure. Manual refresh no longer shows a false error. Purchases remain disabled and no paid benefits are granted." },
  "zh-CN": { title: "修正会员资格准备中提示", body: "Stripe正式计费尚未配置时，显示连接准备中，而不是通信失败。手动重新检查也不会显示错误的失败提示。购买仍然禁用，不会授予付费权益。" },
  "zh-TW": { title: "修正會員資格準備中提示", body: "Stripe正式計費尚未設定時，顯示連線準備中，而不是通訊失敗。手動重新檢查也不會顯示錯誤的失敗提示。購買仍然停用，不會授予付費權益。" },
  ko: { title: "회원 자격 준비 상태 표시 수정", body: "Stripe 운영 결제가 설정되지 않았을 때 연결 실패 대신 준비 중으로 표시합니다. 수동 재확인에서도 잘못된 실패 경고가 나타나지 않습니다. 구매는 계속 비활성화되며 유료 혜택은 부여하지 않습니다." },
  es: { title: "Aclarar el estado de preparación de la membresía", body: "Si la facturación de Stripe en producción no está configurada, se muestra un estado de preparación y no un fallo de conexión. La comprobación manual ya no muestra un error falso. Las compras siguen desactivadas y no se conceden beneficios de pago." },
  de: { title: "Vorbereitungsstatus der Mitgliedschaft korrigieren", body: "Wenn Stripe im Produktivbetrieb noch nicht eingerichtet ist, wird Vorbereitung statt eines Verbindungsfehlers angezeigt. Auch die manuelle Prüfung zeigt keinen falschen Fehler mehr. Käufe bleiben deaktiviert und kostenpflichtige Vorteile werden nicht gewährt." },
  fr: { title: "Clarifier la préparation de l’abonnement", body: "Si la facturation Stripe en production n’est pas configurée, un statut de préparation remplace l’erreur de connexion. La vérification manuelle n’affiche plus de fausse erreur. Les achats restent désactivés et aucun avantage payant n’est accordé." },
  "pt-BR": { title: "Corrigir o status de preparação da assinatura", body: "Quando a cobrança Stripe em produção não está configurada, mostramos preparação em vez de falha de conexão. A verificação manual não exibe mais um erro falso. As compras continuam desativadas e nenhum benefício pago é concedido." },
};

export function releaseAnnouncements(locale: AppLocale): readonly ReleaseAnnouncement[] {
  const text = copy[locale];
  return [
    { id: CURRENT_RELEASE_NEWS_VERSION, date: "2026-10-10", tag: "FIX", title: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — ${preparationCopy[locale].title}`, body: preparationCopy[locale].body },
    { id: "0.5.16", date: "2026-10-08", tag: "FIX", title: text.currentTitle.replace(CURRENT_RELEASE_NEWS_VERSION, "0.5.16"), body: text.currentBody },
    { id: "0.5.1", date: "2026-09-21", tag: "APP", title: text.previousTitle, body: text.previousBody },
    { id: "0.5.0", date: "2026-09-21", tag: "APP", title: text.olderTitle, body: text.olderBody },
  ];
}
