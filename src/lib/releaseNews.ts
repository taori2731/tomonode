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
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Mod管理と起動前検査を改善`,
    currentBody: "Minecraft版の範囲メタデータを評価し、[1.20,1.21)には1.20.1を含めます。JAR内に埋め込まれたmixinextrasやgeckolibをトップレベルModの重複として数えません。Modのサーバー用／クライアント用区分、CurseForge・Modrinthのローカル構成解析、ローダーの起動結果記録、バックアップ後に行うMod隔離・復元を追加しました。",
    previousTitle: `${brand.productName} 0.5.1 — コンソール履歴の上限を解除`,
    previousBody: "コンソールの表示・保持・IPC返却にあった固定行数上限をなくし、500行を超えるログも先頭から検索・コピー・保存できるようにしました。同じログの再比較を省略し、画面外の背景サーバー監視を停止、ログ行とサーバーカードの再描画も抑制します。保存形式、サーバー機能、画面の見た目は変更していません。",
    olderTitle: `${brand.productName} 0.5.0 — 監視とログ表示を軽量化`,
    olderBody: "同じログの再比較を省略し、画面外の背景サーバー監視を停止しました。ログ行とサーバーカードの再描画を抑制して、サーバー稼働中のUI操作と長時間のコンソール表示を軽くしています。保存形式、サーバー機能、画面の見た目は変更していません。",
  },
  en: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Safer Mod management and startup checks`,
    currentBody: "Minecraft compatibility metadata is evaluated as a version range, so [1.20,1.21) includes 1.20.1. Embedded mixinextras and geckolib libraries are no longer counted as duplicate top-level Mods. This update adds server/client Mod roles, local CurseForge and Modrinth pack analysis, loader startup results, and backup-first Mod quarantine and restore.",
    previousTitle: `${brand.productName} 0.5.1 — Unlimited console history`,
    previousBody: "The fixed limits on console display, Rust retention, and IPC results are removed: logs beyond 500 rows remain available for search, copy, and save. Unchanged polled snapshots are reused, background monitoring pauses outside server workspaces, and unchanged rows and server cards avoid redundant renders. Saved data, server features, and the visual design remain compatible.",
    olderTitle: `${brand.productName} 0.5.0 — Lighter monitoring and console rendering`,
    olderBody: "Unchanged polled log snapshots are now reused, background server monitoring pauses outside server workspaces, and unchanged console rows and home server cards avoid redundant renders. This keeps server controls and long-running console views more responsive without changing saved data, server features, or the visual design.",
  },
  "zh-CN": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 改进 Mod 管理与启动前检查`,
    currentBody: "按版本范围检查 Minecraft 兼容性，因此 [1.20,1.21) 包含 1.20.1。不会再把 JAR 内嵌的 mixinextras 和 geckolib 库算作顶层 Mod 重复项。本次增加服务器端/客户端 Mod 分类、本地分析 CurseForge 与 Modrinth 整合包、记录加载器启动结果，以及先备份再隔离和恢复 Mod。",
    previousTitle: `${brand.productName} 0.5.1 — 解除控制台历史上限`,
    previousBody: "移除了控制台显示、Rust 保留和 IPC 返回结果的固定行数限制；超过 500 行的日志也可以从开头搜索、复制和保存。未变化的轮询结果会复用，非服务器工作区会暂停后台监控，并减少未变化日志行和服务器卡片的重复渲染。保存数据、服务器功能和视觉设计保持兼容。",
    olderTitle: `${brand.productName} 0.5.0 — 减轻监控与日志渲染`,
    olderBody: "现在会复用未变化的日志轮询结果，在非服务器工作区暂停后台服务器监控，并避免重复渲染未变化的日志行和主页服务器卡片。这样可以提升服务器运行中和长时间查看控制台时的响应，同时不改变保存数据、服务器功能或视觉设计。",
  },
  "zh-TW": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — 改善 Mod 管理與啟動前檢查`,
    currentBody: "依版本範圍檢查 Minecraft 相容性，因此 [1.20,1.21) 包含 1.20.1。不會再把 JAR 內嵌的 mixinextras 和 geckolib 函式庫算作頂層 Mod 重複項。本次新增伺服器端/用戶端 Mod 分類、本機分析 CurseForge 與 Modrinth 整合包、記錄載入器啟動結果，以及先備份再隔離和還原 Mod。",
    previousTitle: `${brand.productName} 0.5.1 — 解除主控台日誌上限`,
    previousBody: "移除主控台顯示、Rust 保留與 IPC 回傳結果的固定行數限制；超過 500 行的日誌也能從開頭搜尋、複製與儲存。未變更的輪詢結果會重用，非伺服器工作區會暫停背景監控，並減少未變更日誌列與伺服器卡片的重複渲染。儲存資料、伺服器功能與視覺設計保持相容。",
    olderTitle: `${brand.productName} 0.5.0 — 減輕監控與日誌渲染`,
    olderBody: "現在會重用未變更的日誌輪詢結果，在非伺服器工作區暫停背景伺服器監控，並避免重複渲染未變更的日誌列與首頁伺服器卡片。這能改善伺服器運行中與長時間查看控制台時的回應，同時不改變儲存資料、伺服器功能或視覺設計。",
  },
  ko: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Mod 관리와 시작 전 검사 개선`,
    currentBody: "Minecraft 호환성을 버전 범위로 검사하므로 [1.20,1.21)에 1.20.1이 포함됩니다. JAR 안에 포함된 mixinextras와 geckolib 라이브러리를 최상위 Mod 중복으로 세지 않습니다. 서버/클라이언트 Mod 분류, CurseForge 및 Modrinth 팩의 로컬 분석, 로더 시작 결과 기록, 백업 후 Mod 격리와 복원을 추가했습니다.",
    previousTitle: `${brand.productName} 0.5.1 — 콘솔 기록 제한 해제`,
    previousBody: "콘솔 표시, Rust 보관, IPC 결과에 있던 고정 줄 수 제한을 제거했습니다. 500줄을 넘는 로그도 처음부터 검색하고 복사하고 저장할 수 있습니다. 변경되지 않은 폴링 결과를 재사용하고, 서버 작업 영역 밖의 백그라운드 감시를 멈추며, 변경되지 않은 로그 행과 서버 카드의 중복 렌더링을 줄였습니다. 저장 데이터와 서버 기능, 화면 디자인은 호환됩니다.",
    olderTitle: `${brand.productName} 0.5.0 — 모니터링과 콘솔 렌더링 경량화`,
    olderBody: "변하지 않은 로그 폴링 결과를 재사용하고, 서버 작업 영역 밖에서는 백그라운드 서버 감시를 중지하며, 변하지 않은 로그 행과 홈 서버 카드의 중복 렌더링을 줄였습니다. 저장 데이터, 서버 기능, 화면 디자인은 변경하지 않고 서버 실행 중과 장시간 콘솔 사용의 반응성을 높입니다.",
  },
  es: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Gestión de Mods y comprobaciones de inicio más seguras`,
    currentBody: "La compatibilidad de Minecraft se evalúa por rangos, por lo que [1.20,1.21) incluye 1.20.1. Las bibliotecas mixinextras y geckolib incluidas dentro de un JAR ya no cuentan como Mods duplicados de nivel superior. Se añaden roles de Mods para servidor/cliente, análisis local de paquetes CurseForge y Modrinth, registro del inicio del cargador y cuarentena/restauración de Mods después de crear una copia de seguridad.",
    previousTitle: `${brand.productName} 0.5.1 — Historial de consola sin límite fijo`,
    previousBody: "Se eliminaron los límites fijos de filas para la consola, la retención en Rust y los resultados IPC. Los registros de más de 500 filas siguen disponibles para buscar, copiar y guardar desde el principio. Se reutilizan los sondeos sin cambios, se pausa la supervisión en segundo plano fuera de las áreas de servidor y se evitan renderizados repetidos. Los datos guardados y las funciones del servidor siguen siendo compatibles.",
    olderTitle: `${brand.productName} 0.5.0 — Supervisión y consola más ligeras`,
    olderBody: "Se reutilizan los resultados de sondeos de registro sin cambios, se pausa la supervisión de servidores en segundo plano fuera de las áreas de servidor y se evitan renderizados repetidos de filas de registro y tarjetas sin cambios. La respuesta mejora sin cambiar los datos guardados, las funciones del servidor ni el diseño visual.",
  },
  de: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Mod-Verwaltung und Startprüfungen verbessert`,
    currentBody: "Minecraft-Kompatibilität wird anhand von Versionsbereichen geprüft; [1.20,1.21) umfasst daher 1.20.1. Eingebettete mixinextras- und geckolib-Bibliotheken zählen nicht mehr als doppelte Mods auf oberster Ebene. Neu sind Server-/Client-Modrollen, lokale Analysen von CurseForge- und Modrinth-Paketen, protokollierte Loader-Startresultate sowie Mod-Quarantäne und Wiederherstellung nach einem Backup.",
    previousTitle: `${brand.productName} 0.5.1 — Unbegrenzter Konsolenverlauf`,
    previousBody: "Die festen Zeilenlimits für Konsolenanzeige, Rust-Aufbewahrung und IPC-Ergebnisse wurden entfernt. Auch Protokolle mit mehr als 500 Zeilen bleiben von Anfang an durchsuchbar, kopierbar und speicherbar. Unveränderte Abfragen werden wiederverwendet, die Hintergrundüberwachung außerhalb der Serverbereiche pausiert und doppelte Renderings werden vermieden. Gespeicherte Daten und Serverfunktionen bleiben kompatibel.",
    olderTitle: `${brand.productName} 0.5.0 — Leichtere Überwachung und Konsolenanzeige`,
    olderBody: "Unveränderte Log-Abfrageergebnisse werden wiederverwendet, die Hintergrundüberwachung außerhalb der Serverbereiche pausiert, und redundante Renderings unveränderter Logzeilen und Serverkarten werden vermieden. Gespeicherte Daten, Serverfunktionen und das visuelle Design bleiben unverändert, während die Bedienung reaktionsschneller wird.",
  },
  fr: {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Gestion des Mods et vérifications de démarrage améliorées`,
    currentBody: "La compatibilité Minecraft est vérifiée avec des plages de versions ; [1.20,1.21) inclut donc 1.20.1. Les bibliothèques mixinextras et geckolib intégrées dans un JAR ne sont plus comptées comme des Mods de premier niveau en double. Cette version ajoute les rôles serveur/client, l’analyse locale des packs CurseForge et Modrinth, le suivi du démarrage du chargeur et la mise en quarantaine/restauration des Mods après sauvegarde.",
    previousTitle: `${brand.productName} 0.5.1 — Historique de console sans limite fixe`,
    previousBody: "Les limites fixes de lignes pour l'affichage de la console, la rétention Rust et les résultats IPC sont supprimées. Les journaux de plus de 500 lignes restent disponibles depuis le début pour la recherche, la copie et l'enregistrement. Les sondages inchangés sont réutilisés, la surveillance en arrière-plan est suspendue hors des espaces serveur et les rendus répétés sont évités. Les données enregistrées et les fonctions du serveur restent compatibles.",
    olderTitle: `${brand.productName} 0.5.0 — Surveillance et console plus légères`,
    olderBody: "Les résultats de sondage des journaux inchangés sont réutilisés, la surveillance des serveurs en arrière-plan est suspendue hors des espaces serveur, et les rendus répétés des lignes et cartes inchangées sont évités. Les données enregistrées, les fonctions du serveur et l'apparence restent inchangées pour une interface plus réactive.",
  },
  "pt-BR": {
    currentTitle: `${brand.productName} ${CURRENT_RELEASE_NEWS_VERSION} — Gestão de Mods e verificações de inicialização aprimoradas`,
    currentBody: "A compatibilidade do Minecraft é verificada por intervalos de versão; por isso, [1.20,1.21) inclui 1.20.1. Bibliotecas mixinextras e geckolib incorporadas em um JAR não são mais contadas como Mods duplicados de nível superior. A atualização adiciona funções de Mod para servidor/cliente, análise local de pacotes CurseForge e Modrinth, registro da inicialização do carregador e quarentena/restauração de Mods após backup.",
    previousTitle: `${brand.productName} 0.5.1 — Histórico do console sem limite fixo`,
    previousBody: "Removemos os limites fixos de linhas da exibição do console, da retenção em Rust e dos resultados IPC. Logs com mais de 500 linhas continuam disponíveis desde o início para pesquisar, copiar e salvar. Resultados de sondagens sem alterações são reutilizados, o monitoramento em segundo plano pausa fora das áreas de servidor e renderizações repetidas são evitadas. Os dados salvos e os recursos do servidor continuam compatíveis.",
    olderTitle: `${brand.productName} 0.5.0 — Monitoramento e console mais leves`,
    olderBody: "Resultados de sondagens de logs sem alterações são reutilizados, o monitoramento de servidores em segundo plano é pausado fora das áreas de servidor e renderizações repetidas de linhas e cartões sem alterações são evitadas. Os dados salvos, os recursos do servidor e o design visual permanecem iguais, com uma interface mais responsiva.",
  },
};

export function releaseAnnouncements(locale: AppLocale): readonly ReleaseAnnouncement[] {
  const text = copy[locale];
  return [
    { id: CURRENT_RELEASE_NEWS_VERSION, date: "2026-09-23", tag: "MOD", title: text.currentTitle, body: text.currentBody },
    { id: "0.5.1", date: "2026-09-21", tag: "APP", title: text.previousTitle, body: text.previousBody },
    { id: "0.5.0", date: "2026-09-21", tag: "APP", title: text.olderTitle, body: text.olderBody },
  ];
}
