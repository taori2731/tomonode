import type { AppLocale } from "./i18n";
import { brand } from "./brand";

export const CURRENT_RELEASE_NEWS_VERSION = "0.5.0";

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
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 監視とログ表示を軽量化`,
    currentBody: "同じログの再比較を省略し、画面外の背景サーバー監視を停止しました。ログ行とサーバーカードの再描画を抑制して、サーバー稼働中のUI操作と長時間のコンソール表示を軽くしています。保存形式、サーバー機能、画面の見た目は変更していません。",
    previousTitle: `${brand.productName} 0.4.8 — 操作と起動を軽量化`,
    previousBody: "サーバー起動・状態取得・プレイヤー検出を画面処理から分離し、状態探査の重複とログの全再走査を抑えました。画面操作を優先しながら、必要な情報を差分で更新します。",
    fixTitle: `${brand.productName} 0.4.7 — BANとログ表示を修正`,
    fixBody: "オンラインプレイヤーのBAN処理を修正し、Forgeの大量ログ表示、状態取得、バックグラウンド監視を軽量化しました。Iron's Spells 'n SpellbooksのLoot Table警告も起動失敗と分けて案内します。",
  },
  en: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Lighter monitoring and console rendering`,
    currentBody: "Unchanged polled log snapshots are now reused, background server monitoring pauses outside server workspaces, and unchanged console rows and home server cards avoid redundant renders. This keeps server controls and long-running console views more responsive without changing saved data, server features, or the visual design.",
    previousTitle: `${brand.productName} 0.4.8 — More responsive startup and navigation`,
    previousBody: "Server startup, status probes, and player detection now run away from UI work. Duplicate probes and full log rescans are avoided so interactions stay responsive while data updates incrementally.",
    fixTitle: `${brand.productName} 0.4.7 — BAN and log display fixes`,
    fixBody: "Fixed online-player bans and reduced the cost of large Forge logs, status polling, and background monitoring. Iron's Spells 'n Spellbooks loot-table warnings are now explained separately from startup failures.",
  },
  "zh-CN": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 减轻监控与日志渲染`,
    currentBody: "现在会复用未变化的日志轮询结果，在非服务器工作区暂停后台服务器监控，并避免重复渲染未变化的日志行和主页服务器卡片。这样可以提升服务器运行中和长时间查看控制台时的响应，同时不改变保存数据、服务器功能或视觉设计。",
    previousTitle: `${brand.productName} 0.4.8 — 启动与切换更流畅`,
    previousBody: "服务器启动、状态探测和玩家检测已从界面处理分离，并避免重复探测与完整日志重扫，让操作优先、数据增量更新。",
    fixTitle: `${brand.productName} 0.4.7 — 修复封禁与日志显示`,
    fixBody: "修复了在线玩家封禁，并降低 Forge 大量日志、状态轮询和后台监控的负担。Iron's Spells 'n Spellbooks 的战利品表警告会与启动失败分开说明。",
  },
  "zh-TW": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 減輕監控與日誌渲染`,
    currentBody: "現在會重用未變更的日誌輪詢結果，在非伺服器工作區暫停背景伺服器監控，並避免重複渲染未變更的日誌列與首頁伺服器卡片。這能改善伺服器運行中與長時間查看控制台時的回應，同時不改變儲存資料、伺服器功能或視覺設計。",
    previousTitle: `${brand.productName} 0.4.8 — 啟動與切換更流暢`,
    previousBody: "伺服器啟動、狀態探測與玩家偵測已從介面處理分離，並避免重複探測與完整日誌重掃，讓操作優先、資料增量更新。",
    fixTitle: `${brand.productName} 0.4.7 — 修正封鎖與日誌顯示`,
    fixBody: "修正了線上玩家封鎖，並降低 Forge 大量日誌、狀態輪詢與背景監控的負擔。Iron's Spells 'n Spellbooks 的戰利品表警告會與啟動失敗分開說明。",
  },
  ko: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 모니터링과 콘솔 렌더링 경량화`,
    currentBody: "변하지 않은 로그 폴링 결과를 재사용하고, 서버 작업 영역 밖에서는 백그라운드 서버 감시를 중지하며, 변하지 않은 로그 행과 홈 서버 카드의 중복 렌더링을 줄였습니다. 저장 데이터, 서버 기능, 화면 디자인은 변경하지 않고 서버 실행 중과 장시간 콘솔 사용의 반응성을 높입니다.",
    previousTitle: `${brand.productName} 0.4.8 — 시작 및 화면 전환 경량화`,
    previousBody: "서버 시작, 상태 확인, 플레이어 감지를 UI 처리와 분리하고 중복 확인과 전체 로그 재검색을 줄였습니다. 조작을 우선하면서 데이터를 증분 갱신합니다.",
    fixTitle: `${brand.productName} 0.4.7 — BAN 및 로그 표시 수정`,
    fixBody: "온라인 플레이어 BAN을 수정하고 Forge 대량 로그, 상태 폴링, 백그라운드 감시의 부하를 줄였습니다. Iron's Spells 'n Spellbooks 전리품 테이블 경고도 시작 실패와 구분해 안내합니다.",
  },
  es: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Supervisión y consola más ligeras`,
    currentBody: "Se reutilizan los resultados de sondeos de registro sin cambios, se pausa la supervisión de servidores en segundo plano fuera de las áreas de servidor y se evitan renderizados repetidos de filas de registro y tarjetas sin cambios. La respuesta mejora sin cambiar los datos guardados, las funciones del servidor ni el diseño visual.",
    previousTitle: `${brand.productName} 0.4.8 — Inicio y navegación más ágiles`,
    previousBody: "El inicio del servidor, las sondas de estado y la detección de jugadores se separaron del trabajo de la interfaz. Se evitan sondas duplicadas y relecturas completas del registro para priorizar la interacción.",
    fixTitle: `${brand.productName} 0.4.7 — Correcciones de BAN y registros`,
    fixBody: "Corregimos el BAN de jugadores conectados y aligeramos los registros masivos de Forge, el sondeo de estado y la supervisión en segundo plano. Los avisos de tablas de botín de Iron's Spells 'n Spellbooks se muestran aparte de los fallos de inicio.",
  },
  de: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Leichtere Überwachung und Konsolenanzeige`,
    currentBody: "Unveränderte Log-Abfrageergebnisse werden wiederverwendet, die Hintergrundüberwachung außerhalb der Serverbereiche pausiert, und redundante Renderings unveränderter Logzeilen und Serverkarten werden vermieden. Gespeicherte Daten, Serverfunktionen und das visuelle Design bleiben unverändert, während die Bedienung reaktionsschneller wird.",
    previousTitle: `${brand.productName} 0.4.8 — Reaktionsschneller Start und Wechsel`,
    previousBody: "Serverstart, Statusabfragen und Spielererkennung wurden von der UI-Arbeit getrennt. Doppelte Abfragen und vollständige Log-Neuscans werden vermieden, damit Bedienung Vorrang hat.",
    fixTitle: `${brand.productName} 0.4.7 — BAN- und Protokollkorrekturen`,
    fixBody: "Online-Spieler-BANs wurden korrigiert und große Forge-Protokolle, Statusabfragen sowie Hintergrundüberwachung entlastet. Loot-Table-Warnungen von Iron's Spells 'n Spellbooks werden getrennt von Startfehlern erklärt.",
  },
  fr: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Surveillance et console plus légères`,
    currentBody: "Les résultats de sondage des journaux inchangés sont réutilisés, la surveillance des serveurs en arrière-plan est suspendue hors des espaces serveur, et les rendus répétés des lignes et cartes inchangées sont évités. Les données enregistrées, les fonctions du serveur et l'apparence restent inchangées pour une interface plus réactive.",
    previousTitle: `${brand.productName} 0.4.8 — Démarrage et navigation plus réactifs`,
    previousBody: "Le démarrage, les sondes d'état et la détection des joueurs sont séparés du travail de l'interface. Les sondes en double et les relectures complètes du journal sont évitées afin de prioriser les interactions.",
    fixTitle: `${brand.productName} 0.4.7 — Corrections des bannissements et journaux`,
    fixBody: "Le bannissement des joueurs connectés a été corrigé et le coût des journaux Forge volumineux, des sondes et de la surveillance en arrière-plan a été réduit. Les avertissements de table de butin d'Iron's Spells 'n Spellbooks sont distingués des échecs de démarrage.",
  },
  "pt-BR": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Monitoramento e console mais leves`,
    currentBody: "Resultados de sondagens de logs sem alterações são reutilizados, o monitoramento de servidores em segundo plano é pausado fora das áreas de servidor e renderizações repetidas de linhas e cartões sem alterações são evitadas. Os dados salvos, os recursos do servidor e o design visual permanecem iguais, com uma interface mais responsiva.",
    previousTitle: `${brand.productName} 0.4.8 — Inicialização e navegação mais leves`,
    previousBody: "A inicialização, as sondagens de status e a detecção de jogadores foram separadas do trabalho da interface. Sondagens duplicadas e releituras completas do log são evitadas para priorizar a interação.",
    fixTitle: `${brand.productName} 0.4.7 — Correções de BAN e exibição de logs`,
    fixBody: "Corrigimos o BAN de jogadores online e reduzimos o custo de logs extensos do Forge, sondagens de status e monitoramento em segundo plano. Avisos de loot table do Iron's Spells 'n Spellbooks são explicados separadamente das falhas de inicialização.",
  },
};

export function releaseAnnouncements(locale: AppLocale): readonly ReleaseAnnouncement[] {
  const text = copy[locale];
  return [
    { id: CURRENT_RELEASE_NEWS_VERSION, date: "2026-09-21", tag: "APP", title: text.currentTitle, body: text.currentBody },
    { id: "0.4.8", date: "2026-09-20", tag: "APP", title: text.previousTitle, body: text.previousBody },
    { id: "0.4.7", date: "2026-09-20", tag: "FIX", title: text.fixTitle, body: text.fixBody },
  ];
}
