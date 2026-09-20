import type { AppLocale } from "./i18n";
import { releaseAnnouncements } from "./releaseNews";

const values = {
  ja: ["サーバー、プレイヤー、テンプレート、設定を検索…", "サーバー", "プレイヤー", "テンプレート", "発見", "ニュース", "すべてのサーバー", "構成から始める", "対応内容を探す", "更新情報とお知らせ", "検索結果はありません", "機能", "設定"],
  en: ["Search servers, players, templates, and settings…", "Servers", "Players", "Templates", "Discover", "News", "All servers", "Start from a configuration", "Explore supported options", "Updates and announcements", "No results found", "Feature", "Settings"],
  "zh-CN": ["搜索服务器、玩家、模板和设置…", "服务器", "玩家", "模板", "发现", "新闻", "所有服务器", "从配置开始", "探索支持内容", "更新与公告", "没有搜索结果", "功能", "设置"],
  "zh-TW": ["搜尋伺服器、玩家、範本與設定…", "伺服器", "玩家", "範本", "探索", "新聞", "所有伺服器", "從設定開始", "探索支援內容", "更新與公告", "找不到結果", "功能", "設定"],
  ko: ["서버, 플레이어, 템플릿, 설정 검색…", "서버", "플레이어", "템플릿", "탐색", "뉴스", "모든 서버", "구성으로 시작", "지원 항목 탐색", "업데이트 및 공지", "검색 결과가 없습니다", "기능", "설정"],
  es: ["Buscar servidores, jugadores, plantillas y ajustes…", "Servidores", "Jugadores", "Plantillas", "Descubrir", "Noticias", "Todos los servidores", "Empezar con una configuración", "Explorar opciones compatibles", "Actualizaciones y avisos", "No hay resultados", "Función", "Ajustes"],
  de: ["Server, Spieler, Vorlagen und Einstellungen suchen…", "Server", "Spieler", "Vorlagen", "Entdecken", "Neuigkeiten", "Alle Server", "Mit einer Konfiguration starten", "Unterstützte Optionen entdecken", "Updates und Hinweise", "Keine Ergebnisse", "Funktion", "Einstellungen"],
  fr: ["Rechercher serveurs, joueurs, modèles et paramètres…", "Serveurs", "Joueurs", "Modèles", "Découvrir", "Actualités", "Tous les serveurs", "Partir d’une configuration", "Explorer les options prises en charge", "Mises à jour et annonces", "Aucun résultat", "Fonction", "Paramètres"],
  "pt-BR": ["Pesquisar servidores, jogadores, modelos e configurações…", "Servidores", "Jogadores", "Modelos", "Descobrir", "Notícias", "Todos os servidores", "Começar por uma configuração", "Explorar opções compatíveis", "Atualizações e avisos", "Nenhum resultado", "Recurso", "Configurações"],
} satisfies Record<AppLocale, readonly string[]>;

export function workspaceText(locale: AppLocale) {
  const [search, servers, players, templates, discover, news, allServers, templateSubtitle, discoverSubtitle, newsSubtitle, noResults, feature, settings] = values[locale];
  return { search, servers, players, templates, discover, news, allServers, templateSubtitle, discoverSubtitle, newsSubtitle, noResults, feature, settings };
}

const catalogDetails: Record<AppLocale, readonly string[]> = {
  ja: ["Vanilla／Paper／Fabric／Forge／NeoForge", "公式Bedrock Dedicated Server", "公式SteamCMD版専用サーバー", "PaperでJava版と統合版のクロスプレイ"],
  en: ["Vanilla, Paper, Fabric, Forge, and NeoForge", "Official Bedrock Dedicated Server", "Official SteamCMD dedicated server", "Java and Bedrock crossplay on Paper"],
  "zh-CN": ["Vanilla、Paper、Fabric、Forge 和 NeoForge", "官方基岩版专用服务器", "官方 SteamCMD 专用服务器", "Paper 上的 Java 版与基岩版跨平台联机"],
  "zh-TW": ["Vanilla、Paper、Fabric、Forge 與 NeoForge", "官方基岩版專用伺服器", "官方 SteamCMD 專用伺服器", "Paper 上的 Java 版與基岩版跨平台連線"],
  ko: ["Vanilla, Paper, Fabric, Forge, NeoForge", "공식 Bedrock 전용 서버", "공식 SteamCMD 전용 서버", "Paper의 Java 및 Bedrock 크로스플레이"],
  es: ["Vanilla, Paper, Fabric, Forge y NeoForge", "Servidor dedicado oficial de Bedrock", "Servidor dedicado oficial mediante SteamCMD", "Juego cruzado Java y Bedrock en Paper"],
  de: ["Vanilla, Paper, Fabric, Forge und NeoForge", "Offizieller Bedrock Dedicated Server", "Offizieller Dedicated Server über SteamCMD", "Java- und Bedrock-Crossplay auf Paper"],
  fr: ["Vanilla, Paper, Fabric, Forge et NeoForge", "Serveur dédié Bedrock officiel", "Serveur dédié officiel via SteamCMD", "Jeu croisé Java et Bedrock sur Paper"],
  "pt-BR": ["Vanilla, Paper, Fabric, Forge e NeoForge", "Servidor dedicado Bedrock oficial", "Servidor dedicado oficial via SteamCMD", "Crossplay entre Java e Bedrock no Paper"],
};

export function supportedCatalog(locale: AppLocale) {
  return ["Minecraft Java", "Minecraft Bedrock", "Palworld", "Geyser + Floodgate"].map((title, index) => ({ title, detail: catalogDetails[locale][index] }));
}

export function workspaceAnnouncements(locale: AppLocale) {
  return releaseAnnouncements(locale);
}
