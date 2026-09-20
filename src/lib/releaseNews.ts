import type { AppLocale } from "./i18n";
import { brand } from "./brand";

export const CURRENT_RELEASE_NEWS_VERSION = "0.4.9";

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
  fixTitle: string;
  fixBody: string;
}>;

const copy: Record<AppLocale, ReleaseNewsCopy> = {
  ja: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 画面切替をさらに軽量化`,
    currentBody: "更新情報をリリース版と同期し、版上げ時にニュース更新を必須にしました。日本語画面の不要なDOM翻訳を外し、他言語の翻訳処理を描画後にまとめ、画面外のポーリングと不要な再描画も抑えました。初期JavaScriptは0.4.8比で約26%小さくなっています。",
    previousTitle: `${brand.productName} 0.4.8 — 操作と起動を軽量化`,
    previousBody: "サーバー起動・状態取得・プレイヤー検出を画面処理から分離し、状態探査の重複とログの全再走査を抑えました。画面操作を優先しながら、必要な情報を差分で更新します。",
    fixTitle: `${brand.productName} 0.4.7 — BANとログ表示を修正`,
    fixBody: "オンラインプレイヤーのBAN処理を修正し、Forgeの大量ログ表示、状態取得、バックグラウンド監視を軽量化しました。Iron's Spells 'n SpellbooksのLoot Table警告も起動失敗と分けて案内します。",
  },
  en: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Faster screen switching`,
    currentBody: "News is now tied to the packaged release and must be updated with every version. Unneeded Japanese DOM translation was removed, other locales translate in batches after paint, off-screen polling and redundant renders were reduced, and initial JavaScript is about 26% smaller than 0.4.8.",
    previousTitle: `${brand.productName} 0.4.8 — More responsive startup and navigation`,
    previousBody: "Server startup, status probes, and player detection now run away from UI work. Duplicate probes and full log rescans are avoided so interactions stay responsive while data updates incrementally.",
    fixTitle: `${brand.productName} 0.4.7 — BAN and log display fixes`,
    fixBody: "Fixed online-player bans and reduced the cost of large Forge logs, status polling, and background monitoring. Iron's Spells 'n Spellbooks loot-table warnings are now explained separately from startup failures.",
  },
  "zh-CN": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 进一步优化界面切换`,
    currentBody: "新闻现在与打包版本绑定，每次升级都必须更新。移除了日语界面不必要的 DOM 翻译，其他语言在绘制后批量翻译，并减少后台页面轮询和重复渲染；初始 JavaScript 比 0.4.8 约小 26%。",
    previousTitle: `${brand.productName} 0.4.8 — 启动与切换更流畅`,
    previousBody: "服务器启动、状态探测和玩家检测已从界面处理分离，并避免重复探测与完整日志重扫，让操作优先、数据增量更新。",
    fixTitle: `${brand.productName} 0.4.7 — 修复封禁与日志显示`,
    fixBody: "修复了在线玩家封禁，并降低 Forge 大量日志、状态轮询和后台监控的负担。Iron's Spells 'n Spellbooks 的战利品表警告会与启动失败分开说明。",
  },
  "zh-TW": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 進一步最佳化畫面切換`,
    currentBody: "新聞現在與封裝版本綁定，每次升級都必須更新。移除日文畫面不必要的 DOM 翻譯，其他語言在繪製後批次翻譯，並減少背景頁面輪詢與重複渲染；初始 JavaScript 比 0.4.8 約小 26%。",
    previousTitle: `${brand.productName} 0.4.8 — 啟動與切換更流暢`,
    previousBody: "伺服器啟動、狀態探測與玩家偵測已從介面處理分離，並避免重複探測與完整日誌重掃，讓操作優先、資料增量更新。",
    fixTitle: `${brand.productName} 0.4.7 — 修正封鎖與日誌顯示`,
    fixBody: "修正了線上玩家封鎖，並降低 Forge 大量日誌、狀態輪詢與背景監控的負擔。Iron's Spells 'n Spellbooks 的戰利品表警告會與啟動失敗分開說明。",
  },
  ko: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 화면 전환 추가 경량화`,
    currentBody: "뉴스를 패키지 버전과 연결해 버전이 바뀔 때 반드시 갱신하도록 했습니다. 일본어 화면의 불필요한 DOM 번역을 제거하고 다른 언어는 화면 표시 후 일괄 번역하며, 화면 밖 폴링과 중복 렌더링도 줄였습니다. 초기 JavaScript는 0.4.8보다 약 26% 작습니다.",
    previousTitle: `${brand.productName} 0.4.8 — 시작 및 화면 전환 경량화`,
    previousBody: "서버 시작, 상태 확인, 플레이어 감지를 UI 처리와 분리하고 중복 확인과 전체 로그 재검색을 줄였습니다. 조작을 우선하면서 데이터를 증분 갱신합니다.",
    fixTitle: `${brand.productName} 0.4.7 — BAN 및 로그 표시 수정`,
    fixBody: "온라인 플레이어 BAN을 수정하고 Forge 대량 로그, 상태 폴링, 백그라운드 감시의 부하를 줄였습니다. Iron's Spells 'n Spellbooks 전리품 테이블 경고도 시작 실패와 구분해 안내합니다.",
  },
  es: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Cambios de pantalla más ligeros`,
    currentBody: "Las noticias están vinculadas a la versión empaquetada y deben actualizarse con cada versión. Eliminamos la traducción DOM innecesaria en japonés, agrupamos la de otros idiomas después del dibujado y reducimos sondeos fuera de pantalla y renderizados repetidos. El JavaScript inicial es cerca de un 26% menor que en 0.4.8.",
    previousTitle: `${brand.productName} 0.4.8 — Inicio y navegación más ágiles`,
    previousBody: "El inicio del servidor, las sondas de estado y la detección de jugadores se separaron del trabajo de la interfaz. Se evitan sondas duplicadas y relecturas completas del registro para priorizar la interacción.",
    fixTitle: `${brand.productName} 0.4.7 — Correcciones de BAN y registros`,
    fixBody: "Corregimos el BAN de jugadores conectados y aligeramos los registros masivos de Forge, el sondeo de estado y la supervisión en segundo plano. Los avisos de tablas de botín de Iron's Spells 'n Spellbooks se muestran aparte de los fallos de inicio.",
  },
  de: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Leichtere Bildschirmwechsel`,
    currentBody: "Neuigkeiten sind nun an die Paketversion gebunden und müssen bei jeder Version aktualisiert werden. Unnötige DOM-Übersetzung für Japanisch entfällt, andere Sprachen werden nach dem Zeichnen gebündelt übersetzt; Hintergrundabfragen und redundante Renderings wurden reduziert. Das Start-JavaScript ist etwa 26% kleiner als in 0.4.8.",
    previousTitle: `${brand.productName} 0.4.8 — Reaktionsschneller Start und Wechsel`,
    previousBody: "Serverstart, Statusabfragen und Spielererkennung wurden von der UI-Arbeit getrennt. Doppelte Abfragen und vollständige Log-Neuscans werden vermieden, damit Bedienung Vorrang hat.",
    fixTitle: `${brand.productName} 0.4.7 — BAN- und Protokollkorrekturen`,
    fixBody: "Online-Spieler-BANs wurden korrigiert und große Forge-Protokolle, Statusabfragen sowie Hintergrundüberwachung entlastet. Loot-Table-Warnungen von Iron's Spells 'n Spellbooks werden getrennt von Startfehlern erklärt.",
  },
  fr: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Changements d'écran plus légers`,
    currentBody: "Les actualités sont désormais liées à la version du paquet et doivent changer à chaque version. La traduction DOM inutile en japonais a été retirée, les autres langues sont traduites par lots après l'affichage, et les sondes hors écran ainsi que les rendus répétés ont été réduits. Le JavaScript initial est environ 26% plus petit qu'en 0.4.8.",
    previousTitle: `${brand.productName} 0.4.8 — Démarrage et navigation plus réactifs`,
    previousBody: "Le démarrage, les sondes d'état et la détection des joueurs sont séparés du travail de l'interface. Les sondes en double et les relectures complètes du journal sont évitées afin de prioriser les interactions.",
    fixTitle: `${brand.productName} 0.4.7 — Corrections des bannissements et journaux`,
    fixBody: "Le bannissement des joueurs connectés a été corrigé et le coût des journaux Forge volumineux, des sondes et de la surveillance en arrière-plan a été réduit. Les avertissements de table de butin d'Iron's Spells 'n Spellbooks sont distingués des échecs de démarrage.",
  },
  "pt-BR": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Trocas de tela mais leves`,
    currentBody: "As notícias agora são vinculadas à versão empacotada e devem mudar a cada versão. Removemos a tradução DOM desnecessária em japonês, agrupamos a tradução dos outros idiomas após a renderização e reduzimos sondagens fora da tela e renderizações repetidas. O JavaScript inicial ficou cerca de 26% menor que no 0.4.8.",
    previousTitle: `${brand.productName} 0.4.8 — Inicialização e navegação mais leves`,
    previousBody: "A inicialização, as sondagens de status e a detecção de jogadores foram separadas do trabalho da interface. Sondagens duplicadas e releituras completas do log são evitadas para priorizar a interação.",
    fixTitle: `${brand.productName} 0.4.7 — Correções de BAN e exibição de logs`,
    fixBody: "Corrigimos o BAN de jogadores online e reduzimos o custo de logs extensos do Forge, sondagens de status e monitoramento em segundo plano. Avisos de loot table do Iron's Spells 'n Spellbooks são explicados separadamente das falhas de inicialização.",
  },
};

export function releaseAnnouncements(locale: AppLocale): readonly ReleaseAnnouncement[] {
  const text = copy[locale];
  return [
    { id: CURRENT_RELEASE_NEWS_VERSION, date: "2026-09-20", tag: "APP", title: text.currentTitle, body: text.currentBody },
    { id: "0.4.8", date: "2026-09-20", tag: "APP", title: text.previousTitle, body: text.previousBody },
    { id: "0.4.7", date: "2026-09-20", tag: "FIX", title: text.fixTitle, body: text.fixBody },
  ];
}
