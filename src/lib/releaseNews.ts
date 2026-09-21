import type { AppLocale } from "./i18n";
import { brand } from "./brand";

export const CURRENT_RELEASE_NEWS_VERSION = "0.5.1";

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
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — コンソール履歴の上限を解除`,
    currentBody: "コンソールの表示・保持・IPC返却にあった固定行数上限をなくし、500行を超えるログも先頭から検索・コピー・保存できるようにしました。同じログの再比較を省略し、画面外の背景サーバー監視を停止、ログ行とサーバーカードの再描画も抑制します。保存形式、サーバー機能、画面の見た目は変更していません。",
    previousTitle: `${brand.productName} 0.5.0 — 監視とログ表示を軽量化`,
    previousBody: "同じログの再比較を省略し、画面外の背景サーバー監視を停止しました。ログ行とサーバーカードの再描画を抑制して、サーバー稼働中のUI操作と長時間のコンソール表示を軽くしています。保存形式、サーバー機能、画面の見た目は変更していません。",
    fixTitle: `${brand.productName} 0.4.7 — BANとログ表示を修正`,
    fixBody: "オンラインプレイヤーのBAN処理を修正し、Forgeの大量ログ表示、状態取得、バックグラウンド監視を軽量化しました。Iron's Spells 'n SpellbooksのLoot Table警告も起動失敗と分けて案内します。",
  },
  en: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Unlimited console history`,
    currentBody: "The fixed limits on console display, Rust retention, and IPC results are removed: logs beyond 500 rows remain available for search, copy, and save. Unchanged polled snapshots are reused, background monitoring pauses outside server workspaces, and unchanged rows and server cards avoid redundant renders. Saved data, server features, and the visual design remain compatible.",
    previousTitle: `${brand.productName} 0.5.0 — Lighter monitoring and console rendering`,
    previousBody: "Unchanged polled log snapshots are now reused, background server monitoring pauses outside server workspaces, and unchanged console rows and home server cards avoid redundant renders. This keeps server controls and long-running console views more responsive without changing saved data, server features, or the visual design.",
    fixTitle: `${brand.productName} 0.4.7 — BAN and log display fixes`,
    fixBody: "Fixed online-player bans and reduced the cost of large Forge logs, status polling, and background monitoring. Iron's Spells 'n Spellbooks loot-table warnings are now explained separately from startup failures.",
  },
  "zh-CN": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 解除控制台历史上限`,
    currentBody: "移除了控制台显示、Rust 保留和 IPC 返回结果的固定行数限制；超过 500 行的日志也可以从开头搜索、复制和保存。未变化的轮询结果会复用，非服务器工作区会暂停后台监控，并减少未变化日志行和服务器卡片的重复渲染。保存数据、服务器功能和视觉设计保持兼容。",
    previousTitle: `${brand.productName} 0.5.0 — 减轻监控与日志渲染`,
    previousBody: "现在会复用未变化的日志轮询结果，在非服务器工作区暂停后台服务器监控，并避免重复渲染未变化的日志行和主页服务器卡片。这样可以提升服务器运行中和长时间查看控制台时的响应，同时不改变保存数据、服务器功能或视觉设计。",
    fixTitle: `${brand.productName} 0.4.7 — 修复封禁与日志显示`,
    fixBody: "修复了在线玩家封禁，并降低 Forge 大量日志、状态轮询和后台监控的负担。Iron's Spells 'n Spellbooks 的战利品表警告会与启动失败分开说明。",
  },
  "zh-TW": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 解除主控台日誌上限`,
    currentBody: "移除主控台顯示、Rust 保留與 IPC 回傳結果的固定行數限制；超過 500 行的日誌也能從開頭搜尋、複製與儲存。未變更的輪詢結果會重用，非伺服器工作區會暫停背景監控，並減少未變更日誌列與伺服器卡片的重複渲染。儲存資料、伺服器功能與視覺設計保持相容。",
    previousTitle: `${brand.productName} 0.5.0 — 減輕監控與日誌渲染`,
    previousBody: "現在會重用未變更的日誌輪詢結果，在非伺服器工作區暫停背景伺服器監控，並避免重複渲染未變更的日誌列與首頁伺服器卡片。這能改善伺服器運行中與長時間查看控制台時的回應，同時不改變儲存資料、伺服器功能或視覺設計。",
    fixTitle: `${brand.productName} 0.4.7 — 修正封鎖與日誌顯示`,
    fixBody: "修正了線上玩家封鎖，並降低 Forge 大量日誌、狀態輪詢與背景監控的負擔。Iron's Spells 'n Spellbooks 的戰利品表警告會與啟動失敗分開說明。",
  },
  ko: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 콘솔 기록 제한 해제`,
    currentBody: "콘솔 표시, Rust 보관, IPC 결과에 있던 고정 줄 수 제한을 제거했습니다. 500줄을 넘는 로그도 처음부터 검색하고 복사하고 저장할 수 있습니다. 변경되지 않은 폴링 결과를 재사용하고, 서버 작업 영역 밖의 백그라운드 감시를 멈추며, 변경되지 않은 로그 행과 서버 카드의 중복 렌더링을 줄였습니다. 저장 데이터와 서버 기능, 화면 디자인은 호환됩니다.",
    previousTitle: `${brand.productName} 0.5.0 — 모니터링과 콘솔 렌더링 경량화`,
    previousBody: "변하지 않은 로그 폴링 결과를 재사용하고, 서버 작업 영역 밖에서는 백그라운드 서버 감시를 중지하며, 변하지 않은 로그 행과 홈 서버 카드의 중복 렌더링을 줄였습니다. 저장 데이터, 서버 기능, 화면 디자인은 변경하지 않고 서버 실행 중과 장시간 콘솔 사용의 반응성을 높입니다.",
    fixTitle: `${brand.productName} 0.4.7 — BAN 및 로그 표시 수정`,
    fixBody: "온라인 플레이어 BAN을 수정하고 Forge 대량 로그, 상태 폴링, 백그라운드 감시의 부하를 줄였습니다. Iron's Spells 'n Spellbooks 전리품 테이블 경고도 시작 실패와 구분해 안내합니다.",
  },
  es: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Historial de consola sin límite fijo`,
    currentBody: "Se eliminaron los límites fijos de filas para la consola, la retención en Rust y los resultados IPC. Los registros de más de 500 filas siguen disponibles para buscar, copiar y guardar desde el principio. Se reutilizan los sondeos sin cambios, se pausa la supervisión en segundo plano fuera de las áreas de servidor y se evitan renderizados repetidos. Los datos guardados y las funciones del servidor siguen siendo compatibles.",
    previousTitle: `${brand.productName} 0.5.0 — Supervisión y consola más ligeras`,
    previousBody: "Se reutilizan los resultados de sondeos de registro sin cambios, se pausa la supervisión de servidores en segundo plano fuera de las áreas de servidor y se evitan renderizados repetidos de filas de registro y tarjetas sin cambios. La respuesta mejora sin cambiar los datos guardados, las funciones del servidor ni el diseño visual.",
    fixTitle: `${brand.productName} 0.4.7 — Correcciones de BAN y registros`,
    fixBody: "Corregimos el BAN de jugadores conectados y aligeramos los registros masivos de Forge, el sondeo de estado y la supervisión en segundo plano. Los avisos de tablas de botín de Iron's Spells 'n Spellbooks se muestran aparte de los fallos de inicio.",
  },
  de: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Unbegrenzter Konsolenverlauf`,
    currentBody: "Die festen Zeilenlimits für Konsolenanzeige, Rust-Aufbewahrung und IPC-Ergebnisse wurden entfernt. Auch Protokolle mit mehr als 500 Zeilen bleiben von Anfang an durchsuchbar, kopierbar und speicherbar. Unveränderte Abfragen werden wiederverwendet, die Hintergrundüberwachung außerhalb der Serverbereiche pausiert und doppelte Renderings werden vermieden. Gespeicherte Daten und Serverfunktionen bleiben kompatibel.",
    previousTitle: `${brand.productName} 0.5.0 — Leichtere Überwachung und Konsolenanzeige`,
    previousBody: "Unveränderte Log-Abfrageergebnisse werden wiederverwendet, die Hintergrundüberwachung außerhalb der Serverbereiche pausiert, und redundante Renderings unveränderter Logzeilen und Serverkarten werden vermieden. Gespeicherte Daten, Serverfunktionen und das visuelle Design bleiben unverändert, während die Bedienung reaktionsschneller wird.",
    fixTitle: `${brand.productName} 0.4.7 — BAN- und Protokollkorrekturen`,
    fixBody: "Online-Spieler-BANs wurden korrigiert und große Forge-Protokolle, Statusabfragen sowie Hintergrundüberwachung entlastet. Loot-Table-Warnungen von Iron's Spells 'n Spellbooks werden getrennt von Startfehlern erklärt.",
  },
  fr: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Historique de console sans limite fixe`,
    currentBody: "Les limites fixes de lignes pour l'affichage de la console, la rétention Rust et les résultats IPC sont supprimées. Les journaux de plus de 500 lignes restent disponibles depuis le début pour la recherche, la copie et l'enregistrement. Les sondages inchangés sont réutilisés, la surveillance en arrière-plan est suspendue hors des espaces serveur et les rendus répétés sont évités. Les données enregistrées et les fonctions du serveur restent compatibles.",
    previousTitle: `${brand.productName} 0.5.0 — Surveillance et console plus légères`,
    previousBody: "Les résultats de sondage des journaux inchangés sont réutilisés, la surveillance des serveurs en arrière-plan est suspendue hors des espaces serveur, et les rendus répétés des lignes et cartes inchangées sont évités. Les données enregistrées, les fonctions du serveur et l'apparence restent inchangées pour une interface plus réactive.",
    fixTitle: `${brand.productName} 0.4.7 — Corrections des bannissements et journaux`,
    fixBody: "Le bannissement des joueurs connectés a été corrigé et le coût des journaux Forge volumineux, des sondes et de la surveillance en arrière-plan a été réduit. Les avertissements de table de butin d'Iron's Spells 'n Spellbooks sont distingués des échecs de démarrage.",
  },
  "pt-BR": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Histórico do console sem limite fixo`,
    currentBody: "Removemos os limites fixos de linhas da exibição do console, da retenção em Rust e dos resultados IPC. Logs com mais de 500 linhas continuam disponíveis desde o início para pesquisar, copiar e salvar. Resultados de sondagens sem alterações são reutilizados, o monitoramento em segundo plano pausa fora das áreas de servidor e renderizações repetidas são evitadas. Os dados salvos e os recursos do servidor continuam compatíveis.",
    previousTitle: `${brand.productName} 0.5.0 — Monitoramento e console mais leves`,
    previousBody: "Resultados de sondagens de logs sem alterações são reutilizados, o monitoramento de servidores em segundo plano é pausado fora das áreas de servidor e renderizações repetidas de linhas e cartões sem alterações são evitadas. Os dados salvos, os recursos do servidor e o design visual permanecem iguais, com uma interface mais responsiva.",
    fixTitle: `${brand.productName} 0.4.7 — Correções de BAN e exibição de logs`,
    fixBody: "Corrigimos o BAN de jogadores online e reduzimos o custo de logs extensos do Forge, sondagens de status e monitoramento em segundo plano. Avisos de loot table do Iron's Spells 'n Spellbooks são explicados separadamente das falhas de inicialização.",
  },
};

export function releaseAnnouncements(locale: AppLocale): readonly ReleaseAnnouncement[] {
  const text = copy[locale];
  return [
    { id: CURRENT_RELEASE_NEWS_VERSION, date: "2026-09-21", tag: "APP", title: text.currentTitle, body: text.currentBody },
    { id: "0.5.0", date: "2026-09-21", tag: "APP", title: text.previousTitle, body: text.previousBody },
    { id: "0.4.7", date: "2026-09-20", tag: "FIX", title: text.fixTitle, body: text.fixBody },
  ];
}
