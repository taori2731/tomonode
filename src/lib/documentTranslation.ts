import type { AppLocale } from "./i18n";
import { getTranslationCatalog } from "./translationCatalog";

const JAPANESE = /[\u3041-\u30fa\u3400-\u9fff]/;
const MARKER = /\[\[VAR\d+\]\]/g;
const TRANSLATED_ATTRIBUTES = ["aria-label", "title", "placeholder"] as const;
const EXCLUDED_SELECTOR = [
  "[data-no-translate]",
  "pre",
  "code",
].join(",");

const CURATED_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "ビジター": "Visitor", "メンバー": "Member", "オペレーター": "Operator", "許可リストを有効にする": "Enable allowlist", "ホワイトリストを有効にする": "Enable whitelist", "ポート番号（UDP）": "Port number (UDP)", "ポート番号（TCP）": "Port number (TCP)", "空きを選ぶ": "Choose available port", "PvPを有効にする": "Enable PvP", "シングルプレイに近いワールド生成設定": "Single-player-style world generation",
    "キャンセル": "Cancel",
    "確認とEULA": "Review & EULA",
    "作成画面を閉じる": "Close server creation",
    "作成手順": "Creation steps",
    "このサーバー用の推奨値を再計算できます": "You can recalculate recommended settings for this server",
    "CPU・メモリ・Java・保存先の空き容量だけをPC内で確認します。結果は外部へ送信しません。": "Only CPU, memory, Java, and free storage space are checked on this PC. Results are not sent externally.",
    "サーバーの保存先": "Server storage location",
    "診断する保存先フォルダー": "Folder to check for storage space",
    "PCを診断中…": "Diagnosing this PC…",
    "このPCを診断": "Diagnose this PC",
    "もう一度診断": "Diagnose again",
    "今回は診断せずに次へ進むこともできます。作成後は概要画面から手動診断できます。": "You can continue without diagnosis this time. After creation, you can run it manually from Overview.",
    "検索・対応版・ダウンロードは公式Modrinth API/CDNだけを使用します。": "Search, compatibility data, and downloads use only the official Modrinth API and CDN.",
    "インポート": "Import",
    "難易度": "Difficulty",
    "スポーン保護範囲": "Spawn protection radius",
    "描画距離": "View distance",
    "大きなバイオーム": "Large biomes",
    "アンプリファイド": "Amplified",
    "ワールド生成のシード値": "World seed",
    "村や要塞などの構造物を生成する": "Generate structures such as villages and strongholds",
    "参加時の案内": "Join prompt",
    "サーバー停止中": "Server stopped",
    "オンライン": "Online",
    "安全停止でワールドを保存します": "The world is saved during safe shutdown.",
    "メモリ圧力": "Memory pressure",
    "ローカル応答": "Local response",
    "設定した上限に対する割合": "Percentage of the configured limit",
    "Javaプロセスの使用率": "Java process usage",
    "チャンク数はMinecraft共通APIがないため非表示": "Chunk count is hidden because Minecraft has no common API.",
    "ワールドフォルダーを開く": "Open world folder",
    "ログを検索": "Search logs", "保存": "Save", "送信": "Send",
    "サーバーコマンド": "Server command", "コマンドを入力（例: list）": "Enter a command (e.g. list)",
    "サーバーを起動するとコマンドを送信できます": "Start the server to send commands.",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "Diagnostics run only on this PC. Results are not sent externally, and network speed tests are not run automatically.",
    "クリア": "Clear",
    "サーバーを起動すると、ここに最近のログが表示されます。": "Start the server to show recent logs here.",
    "一致するログはありません。": "No matching logs.",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "Built-in packs included with the official BDS are hidden. Only added or applied packs are shown.",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "No Bedrock add-ons have been added or applied. Packs bundled with the official BDS are excluded for safety.",
    "アプリ管理": "App managed", "外部追加（参照のみ）": "Added externally (read-only)", "保護中": "Protected",
    "XUID待ち・権限はまだ未反映": "Waiting for XUID; permission is not applied yet",
    "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "After the player joins once, confirm their XUID by selecting Register permission again.",
    "待機を取消": "Cancel pending",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "After the player joins, the app confirms the XUID and applies operator permission automatically within about 3 seconds.",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "The allowlist is saved to allowlist.json and permissions to permissions.json. Gamertags without a known XUID remain pending; register them again after they join once to confirm.",
    "このプレイヤーはXUID確認待ちとして登録済みです": "This player is already waiting for XUID confirmation.",
    "権限反映待ちの保存先が正しくありません": "The pending-permission storage path is invalid.",
    "公式BDS同梱または外部追加のパックは保護されています。アプリから追加したパックだけを無効化・削除できます": "Packs bundled with the official BDS or added externally are protected. Only packs added by this app can be disabled or deleted.",
    "と": " and ",
  },
  de: {
    "ビジター": "Besucher", "メンバー": "Mitglied", "オペレーター": "Operator", "許可リストを有効にする": "Allowlist aktivieren", "ホワイトリストを有効にする": "Whitelist aktivieren", "ポート番号（UDP）": "Portnummer (UDP)", "ポート番号（TCP）": "Portnummer (TCP)", "空きを選ぶ": "Freien Port wählen", "PvPを有効にする": "PvP aktivieren", "シングルプレイに近いワールド生成設定": "Weltgenerierung wie im Einzelspieler", "確認とEULA": "Prüfen & EULA",
    "キャンセル": "Abbrechen", "インポート": "Importieren", "難易度": "Schwierigkeitsgrad",
    "サーバー停止中": "Server gestoppt", "Javaプロセスの使用率": "Java-Prozessauslastung",
    "オンライン": "Online", "安全停止でワールドを保存します": "Beim sicheren Herunterfahren wird die Welt gespeichert.",
    "メモリ圧力": "Speicherdruck", "ローカル応答": "Lokale Antwort", "設定した上限に対する割合": "Anteil am festgelegten Limit",
    "チャンク数はMinecraft共通APIがないため非表示": "Die Chunk-Anzahl wird ausgeblendet, da Minecraft keine einheitliche API bietet.",
    "ワールドフォルダーを開く": "Weltordner öffnen", "ログを検索": "Protokolle durchsuchen", "保存": "Speichern", "送信": "Senden",
    "サーバーコマンド": "Serverbefehl", "コマンドを入力（例: list）": "Befehl eingeben (z. B. list)",
    "サーバーを起動するとコマンドを送信できます": "Starte den Server, um Befehle zu senden.", "クリア": "Leeren",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "Die Diagnose wird nur auf diesem PC ausgeführt. Ergebnisse werden nicht extern gesendet und Netzwerkgeschwindigkeitstests werden nicht automatisch gestartet.",
    "サーバーを起動すると、ここに最近のログが表示されます。": "Starte den Server, damit hier die neuesten Protokolle angezeigt werden.",
    "一致するログはありません。": "Keine passenden Protokolle.", "と": " und ",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "Integrierte Pakete des offiziellen BDS werden ausgeblendet. Nur hinzugefügte oder angewendete Pakete werden angezeigt.",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "Es wurden keine Bedrock-Add-ons hinzugefügt oder angewendet. Mit dem offiziellen BDS gelieferte Pakete sind aus Sicherheitsgründen ausgeschlossen.",
    "アプリ管理": "Von der App verwaltet", "外部追加（参照のみ）": "Extern hinzugefügt (nur Lesen)", "保護中": "Geschützt",
    "XUID待ち・権限はまだ未反映": "XUID ausstehend; Berechtigung noch nicht angewendet", "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "Nachdem der Spieler einmal beigetreten ist, wählen Sie erneut „Berechtigung registrieren“, um die XUID zu bestätigen.", "待機を取消": "Ausstehend abbrechen",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "Nach dem Beitritt wird die XUID innerhalb von etwa 3 Sekunden geprüft und die Operatorberechtigung automatisch angewendet.",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "Die Zulassungsliste wird in allowlist.json und Berechtigungen in permissions.json gespeichert. Gamertags ohne bekannte XUID bleiben ausstehend; registrieren Sie sie nach dem ersten Beitritt erneut.",
  },
  es: {
    "ビジター": "Visitante", "メンバー": "Miembro", "オペレーター": "Operador", "許可リストを有効にする": "Activar lista de permitidos", "ホワイトリストを有効にする": "Activar lista blanca", "ポート番号（UDP）": "Número de puerto (UDP)", "ポート番号（TCP）": "Número de puerto (TCP)", "空きを選ぶ": "Elegir puerto libre", "PvPを有効にする": "Activar PvP", "シングルプレイに近いワールド生成設定": "Generación de mundo similar al modo individual", "確認とEULA": "Revisión y EULA",
    "キャンセル": "Cancelar", "インポート": "Importar", "難易度": "Dificultad",
    "サーバー停止中": "Servidor detenido", "Javaプロセスの使用率": "Uso del proceso Java",
    "オンライン": "En línea", "安全停止でワールドを保存します": "El mundo se guarda durante el apagado seguro.",
    "メモリ圧力": "Presión de memoria", "ローカル応答": "Respuesta local", "設定した上限に対する割合": "Porcentaje del límite configurado",
    "チャンク数はMinecraft共通APIがないため非表示": "El recuento de chunks se oculta porque Minecraft no tiene una API común.",
    "ワールドフォルダーを開く": "Abrir carpeta del mundo", "ログを検索": "Buscar registros", "保存": "Guardar", "送信": "Enviar",
    "サーバーコマンド": "Comando del servidor", "コマンドを入力（例: list）": "Introduce un comando (p. ej., list)",
    "サーバーを起動するとコマンドを送信できます": "Inicia el servidor para enviar comandos.", "クリア": "Limpiar",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "El diagnóstico se ejecuta únicamente en este PC. Los resultados no se envían al exterior y las pruebas de velocidad de red no se ejecutan automáticamente.",
    "サーバーを起動すると、ここに最近のログが表示されます。": "Inicia el servidor para mostrar aquí los registros recientes.",
    "一致するログはありません。": "No hay registros que coincidan.", "と": " y ",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "Los paquetes integrados del BDS oficial se ocultan. Solo se muestran los paquetes añadidos o aplicados.",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "No hay complementos de Bedrock añadidos o aplicados. Los paquetes incluidos con el BDS oficial se excluyen por seguridad.",
    "アプリ管理": "Gestionado por la aplicación", "外部追加（参照のみ）": "Añadido externamente (solo lectura)", "保護中": "Protegido",
    "XUID待ち・権限はまだ未反映": "XUID pendiente; el permiso aún no se ha aplicado", "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "Cuando el jugador se haya unido una vez, vuelve a seleccionar «Registrar permiso» para confirmar su XUID.", "待機を取消": "Cancelar pendiente",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "Después de unirse, la aplicación confirma el XUID y aplica automáticamente el permiso de operador en unos 3 segundos.",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "La lista de permitidos se guarda en allowlist.json y los permisos en permissions.json. Los gamertags sin XUID quedan pendientes; regístralos de nuevo después de que se unan una vez.",
  },
  fr: {
    "ビジター": "Visiteur", "メンバー": "Membre", "オペレーター": "Opérateur", "許可リストを有効にする": "Activer la liste d’autorisation", "ホワイトリストを有効にする": "Activer la liste blanche", "ポート番号（UDP）": "Numéro de port (UDP)", "ポート番号（TCP）": "Numéro de port (TCP)", "空きを選ぶ": "Choisir un port libre", "PvPを有効にする": "Activer le PvP", "シングルプレイに近いワールド生成設定": "Génération du monde comme en solo", "確認とEULA": "Vérification et EULA",
    "キャンセル": "Annuler", "インポート": "Importer", "難易度": "Difficulté",
    "サーバー停止中": "Serveur arrêté", "Javaプロセスの使用率": "Utilisation du processus Java",
    "オンライン": "En ligne", "安全停止でワールドを保存します": "Le monde est enregistré lors de l’arrêt sécurisé.",
    "メモリ圧力": "Pression mémoire", "ローカル応答": "Réponse locale", "設定した上限に対する割合": "Pourcentage de la limite configurée",
    "チャンク数はMinecraft共通APIがないため非表示": "Le nombre de chunks est masqué, car Minecraft ne fournit pas d’API commune.",
    "ワールドフォルダーを開く": "Ouvrir le dossier du monde", "ログを検索": "Rechercher dans les journaux", "保存": "Enregistrer", "送信": "Envoyer",
    "サーバーコマンド": "Commande serveur", "コマンドを入力（例: list）": "Saisissez une commande (ex. : list)",
    "サーバーを起動するとコマンドを送信できます": "Démarrez le serveur pour envoyer des commandes.", "クリア": "Effacer",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "Le diagnostic s’exécute uniquement sur ce PC. Les résultats ne sont pas envoyés à l’extérieur et les tests de débit réseau ne démarrent pas automatiquement.",
    "サーバーを起動すると、ここに最近のログが表示されます。": "Démarrez le serveur pour afficher ici les journaux récents.",
    "一致するログはありません。": "Aucun journal correspondant.", "と": " et ",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "Les packs intégrés au BDS officiel sont masqués. Seuls les packs ajoutés ou appliqués sont affichés.",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "Aucun module complémentaire Bedrock n’a été ajouté ou appliqué. Les packs fournis avec le BDS officiel sont exclus par sécurité.",
    "アプリ管理": "Géré par l’application", "外部追加（参照のみ）": "Ajouté en externe (lecture seule)", "保護中": "Protégé",
    "XUID待ち・権限はまだ未反映": "XUID en attente ; autorisation pas encore appliquée", "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "Après la première connexion du joueur, sélectionnez à nouveau « Enregistrer l’autorisation » pour confirmer son XUID.", "待機を取消": "Annuler l’attente",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "Après la connexion, l’application confirme le XUID et applique automatiquement l’autorisation d’opérateur sous environ 3 secondes.",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "La liste d’autorisation est enregistrée dans allowlist.json et les autorisations dans permissions.json. Les gamertags sans XUID restent en attente ; enregistrez-les à nouveau après leur première connexion.",
  },
  ko: {
    "ビジター": "방문자", "メンバー": "멤버", "オペレーター": "운영자", "許可リストを有効にする": "허용 목록 사용", "ホワイトリストを有効にする": "화이트리스트 사용", "ポート番号（UDP）": "포트 번호(UDP)", "ポート番号（TCP）": "포트 번호(TCP)", "空きを選ぶ": "사용 가능한 포트 선택", "PvPを有効にする": "PvP 사용", "シングルプレイに近いワールド生成設定": "싱글 플레이와 유사한 월드 생성", "確認とEULA": "확인 및 EULA",
    "キャンセル": "취소", "インポート": "가져오기", "難易度": "난이도",
    "サーバー停止中": "서버 중지됨", "Javaプロセスの使用率": "Java 프로세스 사용률",
    "オンライン": "온라인", "安全停止でワールドを保存します": "안전하게 중지하며 월드를 저장합니다.",
    "メモリ圧力": "메모리 압력", "ローカル応答": "로컬 응답", "設定した上限に対する割合": "설정한 상한 대비 비율",
    "チャンク数はMinecraft共通APIがないため非表示": "Minecraft 공통 API가 없어 청크 수를 표시하지 않습니다.",
    "ワールドフォルダーを開く": "월드 폴더 열기", "ログを検索": "로그 검색", "保存": "저장", "送信": "보내기",
    "サーバーコマンド": "서버 명령어", "コマンドを入力（例: list）": "명령어 입력 (예: list)",
    "サーバーを起動するとコマンドを送信できます": "서버를 시작하면 명령어를 보낼 수 있습니다.", "クリア": "지우기",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "진단은 이 PC에서만 실행됩니다. 결과를 외부로 전송하지 않으며 네트워크 속도 테스트도 자동으로 실행하지 않습니다.",
    "サーバーを起動すると、ここに最近のログが表示されます。": "서버를 시작하면 여기에 최근 로그가 표시됩니다.",
    "一致するログはありません。": "일치하는 로그가 없습니다.", "と": " 및 ",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "공식 BDS에 기본 포함된 팩은 숨기고 추가하거나 적용한 팩만 표시합니다.",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "추가되거나 적용된 베드락 애드온이 없습니다. 공식 BDS 번들 팩은 안전을 위해 목록에서 제외됩니다.",
    "アプリ管理": "앱 관리", "外部追加（参照のみ）": "외부 추가(읽기 전용)", "保護中": "보호됨",
    "XUID待ち・権限はまだ未反映": "XUID 대기 중; 권한은 아직 적용되지 않음", "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "플레이어가 한 번 참가한 뒤 ‘권한 등록’을 다시 선택하여 XUID를 확인하세요.", "待機を取消": "대기 취소",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "참가 후 약 3초 안에 XUID를 확인하고 운영자 권한을 자동으로 적용합니다.",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "허용 목록은 allowlist.json에, 권한은 permissions.json에 저장됩니다. XUID가 없는 게이머태그는 대기 상태로 표시되며, 한 번 참가한 뒤 다시 등록하면 확정됩니다.",
  },
  "pt-BR": {
    "ビジター": "Visitante", "メンバー": "Membro", "オペレーター": "Operador", "許可リストを有効にする": "Ativar lista de permissões", "ホワイトリストを有効にする": "Ativar lista branca", "ポート番号（UDP）": "Número da porta (UDP)", "ポート番号（TCP）": "Número da porta (TCP)", "空きを選ぶ": "Escolher porta livre", "PvPを有効にする": "Ativar PvP", "シングルプレイに近いワールド生成設定": "Geração de mundo semelhante ao modo solo", "確認とEULA": "Revisão e EULA",
    "キャンセル": "Cancelar", "インポート": "Importar", "難易度": "Dificuldade",
    "サーバー停止中": "Servidor parado", "Javaプロセスの使用率": "Uso do processo Java",
    "オンライン": "Online", "安全停止でワールドを保存します": "O mundo é salvo durante a parada segura.",
    "メモリ圧力": "Pressão de memória", "ローカル応答": "Resposta local", "設定した上限に対する割合": "Percentual do limite configurado",
    "チャンク数はMinecraft共通APIがないため非表示": "A contagem de chunks fica oculta porque o Minecraft não possui uma API comum.",
    "ワールドフォルダーを開く": "Abrir pasta do mundo", "ログを検索": "Pesquisar logs", "保存": "Salvar", "送信": "Enviar",
    "サーバーコマンド": "Comando do servidor", "コマンドを入力（例: list）": "Insira um comando (ex.: list)",
    "サーバーを起動するとコマンドを送信できます": "Inicie o servidor para enviar comandos.", "クリア": "Limpar",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "O diagnóstico é executado somente neste PC. Os resultados não são enviados para fora e os testes de velocidade da rede não são iniciados automaticamente.",
    "サーバーを起動すると、ここに最近のログが表示されます。": "Inicie o servidor para exibir os logs recentes aqui.",
    "一致するログはありません。": "Nenhum log correspondente.", "と": " e ",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "Os pacotes integrados do BDS oficial ficam ocultos. Somente pacotes adicionados ou aplicados são exibidos.",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "Nenhum complemento Bedrock foi adicionado ou aplicado. Os pacotes incluídos no BDS oficial são excluídos por segurança.",
    "アプリ管理": "Gerenciado pelo aplicativo", "外部追加（参照のみ）": "Adicionado externamente (somente leitura)", "保護中": "Protegido",
    "XUID待ち・権限はまだ未反映": "XUID pendente; permissão ainda não aplicada", "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "Depois que o jogador entrar uma vez, selecione “Registrar permissão” novamente para confirmar o XUID.", "待機を取消": "Cancelar pendência",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "Após o jogador entrar, o aplicativo confirma o XUID e aplica automaticamente a permissão de operador em cerca de 3 segundos.",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "A lista de permissões é salva em allowlist.json e as permissões em permissions.json. Gamertags sem XUID ficam pendentes; registre-os novamente após a primeira entrada.",
  },
  "zh-CN": {
    "ビジター": "访客", "メンバー": "成员", "オペレーター": "操作员", "許可リストを有効にする": "启用允许列表", "ホワイトリストを有効にする": "启用白名单", "ポート番号（UDP）": "端口号（UDP）", "ポート番号（TCP）": "端口号（TCP）", "空きを選ぶ": "选择可用端口", "PvPを有効にする": "启用 PvP", "シングルプレイに近いワールド生成設定": "类似单人游戏的世界生成", "確認とEULA": "检查与 EULA",
    "キャンセル": "取消", "インポート": "导入", "難易度": "难度",
    "サーバー停止中": "服务器已停止", "Javaプロセスの使用率": "Java 进程使用率",
    "オンライン": "在线", "安全停止でワールドを保存します": "安全停止时会保存世界。",
    "メモリ圧力": "内存压力", "ローカル応答": "本地响应", "設定した上限に対する割合": "占已配置上限的百分比",
    "チャンク数はMinecraft共通APIがないため非表示": "由于 Minecraft 没有通用 API，因此不显示区块数量。",
    "ワールドフォルダーを開く": "打开世界文件夹", "ログを検索": "搜索日志", "保存": "保存", "送信": "发送",
    "サーバーコマンド": "服务器命令", "コマンドを入力（例: list）": "输入命令（例如：list）",
    "サーバーを起動するとコマンドを送信できます": "启动服务器后即可发送命令。", "クリア": "清空",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "诊断仅在此电脑上运行。结果不会发送到外部，也不会自动运行网络测速。",
    "サーバーを起動すると、ここに最近のログが表示されます。": "启动服务器后，最近日志会显示在这里。",
    "一致するログはありません。": "没有匹配的日志。", "と": "和",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "隐藏官方 BDS 自带的内置包，仅显示已添加或已应用的包。",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "没有已添加或已应用的基岩版附加包。为安全起见，官方 BDS 自带包不列入列表。",
    "アプリ管理": "应用管理", "外部追加（参照のみ）": "外部添加（只读）", "保護中": "受保护",
    "XUID待ち・権限はまだ未反映": "等待 XUID；权限尚未应用", "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "玩家加入一次后，再次选择“注册权限”以确认其 XUID。", "待機を取消": "取消等待",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "玩家加入后，应用会在约 3 秒内确认 XUID 并自动应用操作员权限。",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "允许列表保存在 allowlist.json，权限保存在 permissions.json。尚无 XUID 的玩家名称会保持等待状态；玩家加入一次后再次注册即可确认。",
  },
  "zh-TW": {
    "ビジター": "訪客", "メンバー": "成員", "オペレーター": "操作員", "許可リストを有効にする": "啟用允許清單", "ホワイトリストを有効にする": "啟用白名單", "ポート番号（UDP）": "連接埠號碼（UDP）", "ポート番号（TCP）": "連接埠號碼（TCP）", "空きを選ぶ": "選擇可用連接埠", "PvPを有効にする": "啟用 PvP", "シングルプレイに近いワールド生成設定": "類似單人遊戲的世界生成", "確認とEULA": "檢查與 EULA",
    "キャンセル": "取消", "インポート": "匯入", "難易度": "難度",
    "サーバー停止中": "伺服器已停止", "Javaプロセスの使用率": "Java 處理程序使用率",
    "オンライン": "線上", "安全停止でワールドを保存します": "安全停止時會儲存世界。",
    "メモリ圧力": "記憶體壓力", "ローカル応答": "本機回應", "設定した上限に対する割合": "佔已設定上限的百分比",
    "チャンク数はMinecraft共通APIがないため非表示": "由於 Minecraft 沒有通用 API，因此不顯示區塊數量。",
    "ワールドフォルダーを開く": "開啟世界資料夾", "ログを検索": "搜尋日誌", "保存": "儲存", "送信": "傳送",
    "サーバーコマンド": "伺服器指令", "コマンドを入力（例: list）": "輸入指令（例如：list）",
    "サーバーを起動するとコマンドを送信できます": "啟動伺服器後即可傳送指令。", "クリア": "清除",
    "診断はこのPC内だけで実行され、結果を外部へ送信しません。ネットワーク速度測定は自動実行しません。": "診斷只會在此電腦上執行。結果不會傳送到外部，也不會自動執行網路測速。",
    "サーバーを起動すると、ここに最近のログが表示されます。": "啟動伺服器後，最近日誌會顯示在這裡。",
    "一致するログはありません。": "沒有符合的日誌。", "と": "與",
    "公式BDSに最初から含まれる内蔵パックは表示せず、追加・適用したパックだけを表示します。": "隱藏官方 BDS 內建套件，只顯示已新增或已套用的套件。",
    "追加・適用済みの統合版アドオンはありません。公式BDS同梱パックは安全のため一覧から除外しています。": "沒有已新增或已套用的基岩版附加內容。為安全起見，官方 BDS 隨附套件不列入清單。",
    "アプリ管理": "應用程式管理", "外部追加（参照のみ）": "外部新增（唯讀）", "保護中": "受保護",
    "XUID待ち・権限はまだ未反映": "等待 XUID；權限尚未套用", "プレイヤーが一度参加するとXUIDを確認し、もう一度「権限を登録」で確定できます。": "玩家加入一次後，再次選擇「登錄權限」以確認其 XUID。", "待機を取消": "取消等待",
    "参加後は最大3秒ほどでXUIDを確認し、オペレーター権限を自動反映します。": "玩家加入後，應用程式會在約 3 秒內確認 XUID 並自動套用操作員權限。",
    "許可リストはallowlist.json、権限はpermissions.jsonへ保存します。XUIDをまだ取得できないゲーマータグは反映待ちとして表示し、プレイヤーが一度参加した後にもう一度登録すると確定します。": "允許清單儲存在 allowlist.json，權限儲存在 permissions.json。尚無 XUID 的玩家名稱會保持等待狀態；玩家加入一次後再次登錄即可確認。",
  },
};

const MOD_MANAGEMENT_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "サーバー構成": "Server configuration",
    "Mod構成を開く": "Open Mod configuration",
    "サーバー用Mod": "Server Mods",
    "クライアント用Mod": "Client Mods",
    "サーバー／クライアント構成": "Server / client setup",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "Reviews existing Mods and separates strong from weak evidence. Unknown items are never assigned automatically.",
    "Modパックを解析": "Analyze Modpack",
    "再スキャン": "Rescan",
    "検査中…": "Scanning…",
    "内蔵ライブラリ": "Embedded libraries",
    "隔離・履歴": "Quarantine & history",
    "隔離候補と操作履歴": "Quarantine candidates & history",
    "隔離操作の状態": "Quarantine operation status",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "Launch logs are capped and redact secrets, IPs, and absolute paths. Candidates are suggestions only; files are never moved, deleted, or quarantined automatically.",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "All top-level JARs in mods are listed. Launch-history candidates are hints only; nothing is selected or moved automatically. A backup is created before quarantine, and the original path and SHA-256 are recorded.",
    "mods直下のJAR": "Top-level JARs in mods",
    "起動履歴の候補": "Launch-history candidate",
    "隔離対象として確認できるJARはありません。": "No JARs are available for quarantine.",
    "隔離候補を読み込んでいます…": "Loading quarantine candidates…",
    "隔離確認文": "Quarantine confirmation",
    "確認のため「隔離を実行」と入力": "Type the exact Japanese phrase “隔離を実行” to confirm.",
    "確認のため「復元を実行」と入力": "Type the exact Japanese phrase “復元を実行” to confirm.",
    "バックアップ・隔離中…": "Backing up and quarantining…",
    "上書きせずに元パスへ復元": "Restore to the original path without overwriting",
    "この操作を復元": "Restore this operation",
    "隔離操作履歴はありません。": "There is no quarantine history.",
    "要確認": "Needs recovery",
    "次回起動の検証待ち": "Waiting for next-launch validation",
    "隔離済み・検査待ち": "Quarantined · awaiting recheck",
    "隔離中断の確認が必要": "Interrupted quarantine · recovery required",
    "一部隔離・確認が必要": "Partially quarantined · recovery required",
    "復元中断の確認が必要": "Interrupted restore · recovery required",
    "起動検証済み": "Launch validated",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "An interrupted stage or external change was found after reopening. Check the hashes and explicitly restore without overwriting.",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "Keep the server stopped. Verify the SHA-256 at the original and quarantine paths, then explicitly restore without overwriting a same-named file. Review external changes manually.",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "This operation is committed only when a new launch started afterward reaches the Ready marker. A failed launch requires review and never triggers automatic restore.",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "No launch attempts yet. An entry is saved here after the Ready marker is reached.",
    "クライアント用JSONを出力": "Export client-side JSON",
  },
  de: {
    "サーバー構成": "Serverkonfiguration",
    "Mod構成を開く": "Mod-Konfiguration öffnen",
    "サーバー用Mod": "Server-Mods",
    "クライアント用Mod": "Client-Mods",
    "サーバー／クライアント構成": "Server-/Client-Konfiguration",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "Vorhandene Mods werden nach Belegstärke geordnet. Unbekannte Mods werden keinem Bereich automatisch zugewiesen.",
    "Modパックを解析": "Modpack analysieren",
    "再スキャン": "Erneut scannen",
    "検査中…": "Wird geprüft…",
    "内蔵ライブラリ": "Eingebettete Bibliotheken",
    "隔離・履歴": "Quarantäne und Verlauf",
    "隔離候補と操作履歴": "Quarantänekandidaten und Verlauf",
    "隔離操作の状態": "Status der Quarantäneaktion",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "Startprotokolle sind begrenzt und schwärzen Geheimnisse, IPs und absolute Pfade. Kandidaten sind nur Vorschläge; Dateien werden nie automatisch verschoben, gelöscht oder quarantänisiert.",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "Alle JARs direkt in mods werden angezeigt. Startprotokoll-Kandidaten sind nur Hinweise; Auswahl und Verschiebung erfolgen nie automatisch. Vor der Quarantäne wird gesichert und Originalpfad sowie SHA-256 werden notiert.",
    "mods直下のJAR": "JARs direkt in mods",
    "起動履歴の候補": "Kandidat aus dem Startverlauf",
    "隔離対象として確認できるJARはありません。": "Keine JARs für die Quarantäne verfügbar.",
    "隔離候補を読み込んでいます…": "Quarantänekandidaten werden geladen…",
    "隔離確認文": "Quarantänebestätigung",
    "確認のため「隔離を実行」と入力": "Geben Sie zur Bestätigung exakt „隔離を実行“ ein.",
    "確認のため「復元を実行」と入力": "Geben Sie zur Bestätigung exakt „復元を実行“ ein.",
    "バックアップ・隔離中…": "Sicherung und Quarantäne laufen…",
    "上書きせずに元パスへ復元": "Ohne Überschreiben am Originalpfad wiederherstellen",
    "この操作を復元": "Diesen Vorgang wiederherstellen",
    "隔離操作履歴はありません。": "Kein Quarantäneverlauf vorhanden.",
    "要確認": "Wiederherstellung erforderlich",
    "次回起動の検証待ち": "Wartet auf Prüfung beim nächsten Start",
    "隔離済み・検査待ち": "Quarantänisiert · Prüfung ausstehend",
    "隔離中断の確認が必要": "Quarantäne unterbrochen · Prüfung erforderlich",
    "一部隔離・確認が必要": "Teilweise quarantänisiert · Prüfung erforderlich",
    "復元中断の確認が必要": "Wiederherstellung unterbrochen · Prüfung erforderlich",
    "起動検証済み": "Start erfolgreich geprüft",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "Nach dem erneuten Öffnen wurde ein Zwischenstand oder eine externe Änderung erkannt. Prüfen Sie die Hashes und stellen Sie ausdrücklich ohne Überschreiben wieder her.",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "Lassen Sie den Server gestoppt. Prüfen Sie die SHA-256-Werte am Original- und Quarantänepfad und stellen Sie ohne Überschreiben wieder her. Externe Änderungen müssen manuell geprüft werden.",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "Der Vorgang wird erst bestätigt, wenn ein danach gestarteter Server den Ready-Marker erreicht. Bei einem Startfehler ist eine Prüfung nötig; es erfolgt keine automatische Wiederherstellung.",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "Noch keine Startversuche. Nach Erreichen des Ready-Markers wird hier ein Eintrag gespeichert.",
    "クライアント用JSONを出力": "Client-JSON exportieren",
  },
  es: {
    "サーバー構成": "Configuración del servidor",
    "Mod構成を開く": "Abrir configuración de Mods",
    "サーバー用Mod": "Mods del servidor",
    "クライアント用Mod": "Mods del cliente",
    "サーバー／クライアント構成": "Configuración de servidor y cliente",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "Revisa los Mods existentes y los ordena según la solidez de las pruebas. Los elementos desconocidos no se asignan automáticamente.",
    "Modパックを解析": "Analizar Modpack",
    "再スキャン": "Volver a analizar",
    "検査中…": "Analizando…",
    "内蔵ライブラリ": "Bibliotecas integradas",
    "隔離・履歴": "Cuarentena e historial",
    "隔離候補と操作履歴": "Candidatos en cuarentena e historial",
    "隔離操作の状態": "Estado de la operación de cuarentena",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "Los registros de inicio son limitados y ocultan secretos, IP y rutas absolutas. Los candidatos son solo sugerencias; nunca se mueven, eliminan ni aíslan archivos automáticamente.",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "Se muestran todos los JAR en la carpeta mods. Los candidatos del historial solo sirven como referencia; nada se selecciona ni mueve automáticamente. Antes del aislamiento se crea una copia y se registran la ruta original y SHA-256.",
    "mods直下のJAR": "JAR en la carpeta mods",
    "起動履歴の候補": "Candidato del historial de inicio",
    "隔離対象として確認できるJARはありません。": "No hay JAR disponibles para poner en cuarentena.",
    "隔離候補を読み込んでいます…": "Cargando candidatos de cuarentena…",
    "隔離確認文": "Confirmación de cuarentena",
    "確認のため「隔離を実行」と入力": "Escribe exactamente “隔離を実行” en japonés para confirmar.",
    "確認のため「復元を実行」と入力": "Escribe exactamente “復元を実行” en japonés para confirmar.",
    "バックアップ・隔離中…": "Creando copia y aislando…",
    "上書きせずに元パスへ復元": "Restaurar en la ruta original sin sobrescribir",
    "この操作を復元": "Restaurar esta operación",
    "隔離操作履歴はありません。": "No hay historial de cuarentena.",
    "要確認": "Requiere revisión",
    "次回起動の検証待ち": "A la espera de validar el próximo inicio",
    "隔離済み・検査待ち": "En cuarentena · pendiente de revisar",
    "隔離中断の確認が必要": "Aislamiento interrumpido · requiere revisión",
    "一部隔離・確認が必要": "Aislamiento parcial · requiere revisión",
    "復元中断の確認が必要": "Restauración interrumpida · requiere revisión",
    "起動検証済み": "Inicio validado",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "Tras volver a abrir, se detectó una etapa interrumpida o un cambio externo. Comprueba los hashes y restaura explícitamente sin sobrescribir.",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "Mantén el servidor detenido. Comprueba el SHA-256 de la ruta original y la ruta aislada y restaura explícitamente sin sobrescribir. Revisa manualmente los cambios externos.",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "La operación solo se confirma cuando un inicio posterior alcanza el marcador Ready. Si el inicio falla, requiere revisión y no se restaura automáticamente.",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "Aún no hay intentos de inicio. Se guardará aquí una entrada cuando se alcance el marcador Ready.",
    "クライアント用JSONを出力": "Exportar JSON para clientes",
  },
  fr: {
    "サーバー構成": "Configuration du serveur",
    "Mod構成を開く": "Ouvrir la configuration des Mods",
    "サーバー用Mod": "Mods du serveur",
    "クライアント用Mod": "Mods du client",
    "サーバー／クライアント構成": "Configuration serveur / client",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "Les Mods existants sont classés selon la solidité des indices. Les éléments inconnus ne sont jamais affectés automatiquement.",
    "Modパックを解析": "Analyser le Modpack",
    "再スキャン": "Analyser à nouveau",
    "検査中…": "Analyse en cours…",
    "内蔵ライブラリ": "Bibliothèques intégrées",
    "隔離・履歴": "Quarantaine et historique",
    "隔離候補と操作履歴": "Candidats en quarantaine et historique",
    "隔離操作の状態": "État de l’opération de quarantaine",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "Les journaux de démarrage sont limités et masquent secrets, IP et chemins absolus. Les candidats ne sont que des suggestions : aucun fichier n’est déplacé, supprimé ou mis en quarantaine automatiquement.",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "Tous les JAR à la racine de mods sont affichés. Les candidats du journal ne sont que des indices : rien n’est sélectionné ni déplacé automatiquement. Une sauvegarde précède la quarantaine et le chemin d’origine ainsi que le SHA-256 sont consignés.",
    "mods直下のJAR": "JAR à la racine de mods",
    "起動履歴の候補": "Candidat du journal de démarrage",
    "隔離対象として確認できるJARはありません。": "Aucun JAR disponible pour la quarantaine.",
    "隔離候補を読み込んでいます…": "Chargement des candidats…",
    "隔離確認文": "Confirmation de quarantaine",
    "確認のため「隔離を実行」と入力": "Saisissez exactement la phrase japonaise « 隔離を実行 » pour confirmer.",
    "確認のため「復元を実行」と入力": "Saisissez exactement la phrase japonaise « 復元を実行 » pour confirmer.",
    "バックアップ・隔離中…": "Sauvegarde et mise en quarantaine…",
    "上書きせずに元パスへ復元": "Restaurer vers le chemin d’origine sans écraser",
    "この操作を復元": "Restaurer cette opération",
    "隔離操作履歴はありません。": "Aucun historique de quarantaine.",
    "要確認": "Récupération requise",
    "次回起動の検証待ち": "En attente de validation au prochain démarrage",
    "隔離済み・検査待ち": "En quarantaine · vérification en attente",
    "隔離中断の確認が必要": "Quarantaine interrompue · vérification requise",
    "一部隔離・確認が必要": "Quarantaine partielle · vérification requise",
    "復元中断の確認が必要": "Restauration interrompue · vérification requise",
    "起動検証済み": "Démarrage validé",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "Après réouverture, une étape interrompue ou une modification externe a été détectée. Vérifiez les empreintes et restaurez explicitement sans écraser.",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "Gardez le serveur arrêté. Vérifiez les SHA-256 du chemin d’origine et de la quarantaine, puis restaurez sans écraser. Toute modification externe doit être vérifiée manuellement.",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "L’opération n’est validée que lorsqu’un démarrage ultérieur atteint le marqueur Ready. Un échec exige une vérification et ne déclenche aucune restauration automatique.",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "Aucune tentative pour l’instant. Une entrée sera enregistrée ici après le marqueur Ready.",
    "クライアント用JSONを出力": "Exporter le JSON client",
  },
  ko: {
    "サーバー構成": "서버 구성",
    "Mod構成を開く": "Mod 구성 열기",
    "サーバー用Mod": "서버용 Mod",
    "クライアント用Mod": "클라이언트용 Mod",
    "サーバー／クライアント構成": "서버 / 클라이언트 구성",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "기존 Mod를 근거의 신뢰도에 따라 정리합니다. 확인되지 않은 항목은 자동으로 배치하지 않습니다.",
    "Modパックを解析": "Modpack 분석",
    "再スキャン": "다시 검사",
    "検査中…": "검사 중…",
    "内蔵ライブラリ": "내장 라이브러리",
    "隔離・履歴": "격리 및 기록",
    "隔離候補と操作履歴": "격리 후보 및 작업 기록",
    "隔離操作の状態": "격리 작업 상태",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "시작 로그는 크기가 제한되며 비밀정보, IP, 절대 경로를 가립니다. 후보는 제안일 뿐이며 파일을 자동으로 이동하거나 삭제 또는 격리하지 않습니다.",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "mods 바로 아래의 모든 JAR을 표시합니다. 시작 기록의 후보는 참고용일 뿐이며 자동 선택하거나 이동하지 않습니다. 격리 전에 백업하고 원래 경로와 SHA-256을 기록합니다.",
    "mods直下のJAR": "mods 바로 아래의 JAR",
    "起動履歴の候補": "시작 기록 후보",
    "隔離対象として確認できるJARはありません。": "격리 대상으로 확인된 JAR이 없습니다.",
    "隔離候補を読み込んでいます…": "격리 후보를 불러오는 중…",
    "隔離確認文": "격리 확인 문구",
    "確認のため「隔離を実行」と入力": "확인을 위해 일본어 문구 “隔離を実行”을 정확히 입력하세요.",
    "確認のため「復元を実行」と入力": "확인을 위해 일본어 문구 “復元を実行”을 정확히 입력하세요.",
    "バックアップ・隔離中…": "백업 및 격리 중…",
    "上書きせずに元パスへ復元": "덮어쓰지 않고 원래 경로로 복원",
    "この操作を復元": "이 작업 복원",
    "隔離操作履歴はありません。": "격리 작업 기록이 없습니다.",
    "要確認": "복구 확인 필요",
    "次回起動の検証待ち": "다음 시작 시 검증 대기",
    "隔離済み・検査待ち": "격리됨 · 재검사 대기",
    "隔離中断の確認が必要": "격리 중단 · 확인 필요",
    "一部隔離・確認が必要": "일부 격리됨 · 확인 필요",
    "復元中断の確認が必要": "복원 중단 · 확인 필요",
    "起動検証済み": "시작 검증 완료",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "다시 연 후 중단된 단계나 외부 변경이 발견되었습니다. 해시를 확인하고 덮어쓰지 않도록 직접 복원하세요.",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "서버를 중지한 상태로 원래 경로와 격리 위치의 SHA-256을 확인하고 덮어쓰지 않도록 직접 복원하세요. 외부 변경은 수동으로 확인해야 합니다.",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "이 작업 이후 새로 시작한 서버가 Ready 표시에 도달해야 확정됩니다. 시작 실패는 확인이 필요하며 자동 복원하지 않습니다.",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "시작 시도가 없습니다. Ready 표시에 도달하면 여기에 기록됩니다.",
    "クライアント用JSONを出力": "클라이언트용 JSON 내보내기",
  },
  "pt-BR": {
    "サーバー構成": "Configuração do servidor",
    "Mod構成を開く": "Abrir configuração de Mods",
    "サーバー用Mod": "Mods do servidor",
    "クライアント用Mod": "Mods do cliente",
    "サーバー／クライアント構成": "Configuração de servidor / cliente",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "Organiza os Mods existentes pela força das evidências. Itens não confirmados nunca são atribuídos automaticamente.",
    "Modパックを解析": "Analisar Modpack",
    "再スキャン": "Verificar novamente",
    "検査中…": "Verificando…",
    "内蔵ライブラリ": "Bibliotecas incorporadas",
    "隔離・履歴": "Quarentena e histórico",
    "隔離候補と操作履歴": "Candidatos em quarentena e histórico",
    "隔離操作の状態": "Estado da operação de quarentena",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "Os logs de inicialização são limitados e ocultam segredos, IPs e caminhos absolutos. Candidatos são apenas sugestões; arquivos nunca são movidos, excluídos ou isolados automaticamente.",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "Todos os JARs diretamente em mods são exibidos. Candidatos do histórico são apenas referências; nada é selecionado ou movido automaticamente. Um backup é criado antes da quarentena, e o caminho original e o SHA-256 são registrados.",
    "mods直下のJAR": "JARs diretamente em mods",
    "起動履歴の候補": "Candidato do histórico de inicialização",
    "隔離対象として確認できるJARはありません。": "Não há JARs disponíveis para quarentena.",
    "隔離候補を読み込んでいます…": "Carregando candidatos de quarentena…",
    "隔離確認文": "Confirmação de quarentena",
    "確認のため「隔離を実行」と入力": "Digite exatamente a frase japonesa “隔離を実行” para confirmar.",
    "確認のため「復元を実行」と入力": "Digite exatamente a frase japonesa “復元を実行” para confirmar.",
    "バックアップ・隔離中…": "Fazendo backup e colocando em quarentena…",
    "上書きせずに元パスへ復元": "Restaurar no caminho original sem sobrescrever",
    "この操作を復元": "Restaurar esta operação",
    "隔離操作履歴はありません。": "Não há histórico de quarentena.",
    "要確認": "Revisão necessária",
    "次回起動の検証待ち": "Aguardando validação na próxima inicialização",
    "隔離済み・検査待ち": "Em quarentena · aguardando nova verificação",
    "隔離中断の確認が必要": "Quarentena interrompida · revisão necessária",
    "一部隔離・確認が必要": "Quarentena parcial · revisão necessária",
    "復元中断の確認が必要": "Restauração interrompida · revisão necessária",
    "起動検証済み": "Inicialização validada",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "Após reabrir, foi detectada uma etapa interrompida ou alteração externa. Confira os hashes e restaure explicitamente sem sobrescrever.",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "Mantenha o servidor parado. Confira os SHA-256 no caminho original e na quarentena e restaure sem sobrescrever. Alterações externas exigem verificação manual.",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "A operação só é confirmada quando uma inicialização posterior alcança o marcador Ready. Falhas exigem revisão e nunca acionam restauração automática.",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "Ainda não há tentativas de inicialização. Um registro será salvo aqui quando o marcador Ready for alcançado.",
    "クライアント用JSONを出力": "Exportar JSON do cliente",
  },
  "zh-CN": {
    "サーバー構成": "服务器配置",
    "Mod構成を開く": "打开 Mod 配置",
    "サーバー用Mod": "服务器端 Mod",
    "クライアント用Mod": "客户端 Mod",
    "サーバー／クライアント構成": "服务器 / 客户端配置",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "按证据强弱整理现有 Mod。未经确认的项目不会自动分配位置。",
    "Modパックを解析": "分析 Modpack",
    "再スキャン": "重新扫描",
    "検査中…": "正在检查…",
    "内蔵ライブラリ": "内置库",
    "隔離・履歴": "隔离与历史记录",
    "隔離候補と操作履歴": "隔离候选与操作记录",
    "隔離操作の状態": "隔离操作状态",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "启动日志有大小限制，并会隐藏机密、IP 和绝对路径。候选仅供参考；不会自动移动、删除或隔离文件。",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "显示 mods 目录下的所有顶层 JAR。启动记录中的候选仅作提示；不会自动选择或移动。隔离前会创建备份，并记录原路径和 SHA-256。",
    "mods直下のJAR": "mods 目录下的 JAR",
    "起動履歴の候補": "启动记录候选",
    "隔離対象として確認できるJARはありません。": "没有可隔离的 JAR。",
    "隔離候補を読み込んでいます…": "正在加载隔离候选…",
    "隔離確認文": "隔离确认文本",
    "確認のため「隔離を実行」と入力": "请输入准确的日语短语“隔離を実行”以确认。",
    "確認のため「復元を実行」と入力": "请输入准确的日语短语“復元を実行”以确认。",
    "バックアップ・隔離中…": "正在备份并隔离…",
    "上書きせずに元パスへ復元": "不覆盖并恢复到原路径",
    "この操作を復元": "恢复此操作",
    "隔離操作履歴はありません。": "没有隔离操作记录。",
    "要確認": "需要恢复检查",
    "次回起動の検証待ち": "等待下次启动验证",
    "隔離済み・検査待ち": "已隔离 · 等待重新检查",
    "隔離中断の確認が必要": "隔离中断 · 需要检查",
    "一部隔離・確認が必要": "部分隔离 · 需要检查",
    "復元中断の確認が必要": "恢复中断 · 需要检查",
    "起動検証済み": "启动验证通过",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "重新打开后发现操作中断或外部更改。请核对哈希，并明确选择不覆盖的恢复操作。",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "请保持服务器停止。核对原路径与隔离位置的 SHA-256，然后明确恢复且不要覆盖同名文件。外部更改需手动检查。",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "只有此操作之后启动的服务器到达 Ready 标记时才会确认。启动失败需要检查，不会自动恢复。",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "暂无启动记录。到达 Ready 标记后会在此保存记录。",
    "クライアント用JSONを出力": "导出客户端 JSON",
  },
  "zh-TW": {
    "サーバー構成": "伺服器設定",
    "Mod構成を開く": "開啟 Mod 設定",
    "サーバー用Mod": "伺服器端 Mod",
    "クライアント用Mod": "用戶端 Mod",
    "サーバー／クライアント構成": "伺服器 / 用戶端設定",
    "既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。": "依據證據強弱整理現有 Mod。未經確認的項目不會自動指派位置。",
    "Modパックを解析": "分析 Modpack",
    "再スキャン": "重新掃描",
    "検査中…": "檢查中…",
    "内蔵ライブラリ": "內嵌程式庫",
    "隔離・履歴": "隔離與歷程",
    "隔離候補と操作履歴": "隔離候選與操作歷程",
    "隔離操作の状態": "隔離操作狀態",
    "起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字に保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。": "啟動記錄有大小限制，並會隱藏機密、IP 與絕對路徑。候選僅供參考；不會自動移動、刪除或隔離檔案。",
    "表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。": "顯示 mods 目錄下的所有頂層 JAR。啟動記錄中的候選僅供參考；不會自動選取或移動。隔離前會建立備份，並記錄原始路徑與 SHA-256。",
    "mods直下のJAR": "mods 目錄下的 JAR",
    "起動履歴の候補": "啟動記錄候選",
    "隔離対象として確認できるJARはありません。": "沒有可隔離的 JAR。",
    "隔離候補を読み込んでいます…": "正在載入隔離候選…",
    "隔離確認文": "隔離確認文字",
    "確認のため「隔離を実行」と入力": "請輸入確切的日文詞句「隔離を実行」以確認。",
    "確認のため「復元を実行」と入力": "請輸入確切的日文詞句「復元を実行」以確認。",
    "バックアップ・隔離中…": "正在備份並隔離…",
    "上書きせずに元パスへ復元": "不覆寫並還原至原始路徑",
    "この操作を復元": "還原此操作",
    "隔離操作履歴はありません。": "沒有隔離操作歷程。",
    "要確認": "需要復原檢查",
    "次回起動の検証待ち": "等待下次啟動驗證",
    "隔離済み・検査待ち": "已隔離 · 等待重新檢查",
    "隔離中断の確認が必要": "隔離中斷 · 需要檢查",
    "一部隔離・確認が必要": "部分隔離 · 需要檢查",
    "復元中断の確認が必要": "還原中斷 · 需要檢查",
    "起動検証済み": "啟動驗證通過",
    "再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。": "重新開啟後發現操作中斷或外部變更。請核對雜湊，並明確選擇不覆寫的還原操作。",
    "サーバーを停止したまま元パスと隔離先のSHA-256を確認し、同名ファイルを上書きせず明示的に復元してください。外部変更がある場合は手動確認が必要です。": "請保持伺服器停止。核對原始路徑與隔離位置的 SHA-256，然後明確還原且不要覆寫同名檔案。外部變更需手動檢查。",
    "この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。": "只有此操作之後啟動的伺服器到達 Ready 標記時才會確認。啟動失敗需要檢查，不會自動還原。",
    "起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。": "目前沒有啟動記錄。到達 Ready 標記後會在此儲存記錄。",
    "クライアント用JSONを出力": "匯出用戶端 JSON",
  },
};

const MOD_MANAGEMENT_PATTERNS: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "サーバー用 ([[VAR0]])": "Server ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "Client ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "Embedded libraries ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "Select [[VAR0]] for quarantine",
    "選択した[[VAR0]]件をバックアップして隔離": "Back up and quarantine [[VAR0]] selected item(s)",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "Quarantine and restore require the server to be fully stopped. Current state: [[VAR0]]",
  },
  de: {
    "サーバー用 ([[VAR0]])": "Server ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "Client ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "Eingebettete Bibliotheken ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "[[VAR0]] für die Quarantäne auswählen",
    "選択した[[VAR0]]件をバックアップして隔離": "[[VAR0]] ausgewählte Elemente sichern und quarantänisieren",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "Für Quarantäne und Wiederherstellung muss der Server vollständig gestoppt sein. Aktueller Status: [[VAR0]]",
  },
  es: {
    "サーバー用 ([[VAR0]])": "Servidor ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "Cliente ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "Bibliotecas integradas ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "Seleccionar [[VAR0]] para la cuarentena",
    "選択した[[VAR0]]件をバックアップして隔離": "Crear copia y poner en cuarentena [[VAR0]] elemento(s)",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "El servidor debe estar completamente detenido para aislar o restaurar. Estado actual: [[VAR0]]",
  },
  fr: {
    "サーバー用 ([[VAR0]])": "Serveur ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "Client ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "Bibliothèques intégrées ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "Sélectionner [[VAR0]] pour la quarantaine",
    "選択した[[VAR0]]件をバックアップして隔離": "Sauvegarder et mettre [[VAR0]] élément(s) en quarantaine",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "Le serveur doit être complètement arrêté pour la quarantaine ou la restauration. État actuel : [[VAR0]]",
  },
  ko: {
    "サーバー用 ([[VAR0]])": "서버용 ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "클라이언트용 ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "내장 라이브러리 ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "[[VAR0]] 격리 대상으로 선택",
    "選択した[[VAR0]]件をバックアップして隔離": "선택한 [[VAR0]]개 백업 후 격리",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "격리와 복원은 서버가 완전히 중지된 상태에서만 가능합니다. 현재 상태: [[VAR0]]",
  },
  "pt-BR": {
    "サーバー用 ([[VAR0]])": "Servidor ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "Cliente ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "Bibliotecas incorporadas ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "Selecionar [[VAR0]] para quarentena",
    "選択した[[VAR0]]件をバックアップして隔離": "Fazer backup e colocar [[VAR0]] item(ns) em quarentena",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "O servidor deve estar totalmente parado para quarentena ou restauração. Estado atual: [[VAR0]]",
  },
  "zh-CN": {
    "サーバー用 ([[VAR0]])": "服务器端 ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "客户端 ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "内置库 ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "选择 [[VAR0]] 进行隔离",
    "選択した[[VAR0]]件をバックアップして隔離": "备份并隔离所选的 [[VAR0]] 项",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "隔离或恢复前必须完全停止服务器。当前状态：[[VAR0]]",
  },
  "zh-TW": {
    "サーバー用 ([[VAR0]])": "伺服器端 ([[VAR0]])",
    "クライアント用 ([[VAR0]])": "用戶端 ([[VAR0]])",
    "内蔵ライブラリ ([[VAR0]])": "內嵌程式庫 ([[VAR0]])",
    "[[VAR0]]を隔離対象に選択": "選取 [[VAR0]] 進行隔離",
    "選択した[[VAR0]]件をバックアップして隔離": "備份並隔離所選的 [[VAR0]] 項",
    "隔離・復元にはサーバーが完全停止している必要があります。現在の状態: [[VAR0]]": "隔離或還原前必須完全停止伺服器。目前狀態：[[VAR0]]",
  },
};

const MOD_MANAGEMENT_EXTRA_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "Mod構成の分類": "Mod categories", "サーバー構成の概要": "Server configuration summary", "サーバー用": "Server-side", "クライアント用": "Client-side", "両方": "Both", "任意クライアント": "Optional client", "強い根拠": "Strong evidence", "弱いヒューリスティック": "Weak heuristic", "確認して分類": "Review and classify", "分類を再確認": "Review classification",
    "Modパックから新規構成を作成": "Create a new setup from a Modpack", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "The input is analyzed read-only. Only verified local JARs are copied to a new empty folder.",
    "1. ファイル／フォルダーを選択": "1. Choose a file or folder", "2. 対象を確認": "2. Review the target", "3. サーバー用／クライアント用を分類": "3. Classify server-side and client-side Mods", "4. 未解決依存と再配布条件": "4. Unresolved dependencies and redistribution", "5. 適用計画を確認": "5. Review the setup plan",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "Unknown target details are never filled in automatically. If using an existing server's target, verify it before creating the setup.",
    "未確認は作成先へ配置しません": "Unknown items are not placed in the new setup", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "Applying to an existing server is not implemented and remains disabled. Unknown, client-only, unavailable, or redistribution-unclear JARs are not copied.",
    "確認文字列は計画fingerprintと一致する必要があります。": "The confirmation text must match the plan fingerprint.",
  },
  de: {
    "Mod構成の分類": "Mod-Kategorien", "サーバー構成の概要": "Übersicht der Serverkonfiguration", "サーバー用": "Serverseitig", "クライアント用": "Clientseitig", "両方": "Beide", "任意クライアント": "Optionaler Client", "強い根拠": "Starker Beleg", "弱いヒューリスティック": "Schwache Heuristik", "確認して分類": "Prüfen und zuordnen", "分類を再確認": "Zuordnung prüfen",
    "Modパックから新規構成を作成": "Neue Konfiguration aus einem Modpack erstellen", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "Die Quelle wird schreibgeschützt analysiert. Nur geprüfte lokale JARs werden in einen neuen leeren Ordner kopiert.",
    "1. ファイル／フォルダーを選択": "1. Datei oder Ordner auswählen", "2. 対象を確認": "2. Ziel prüfen", "3. サーバー用／クライアント用を分類": "3. Server- und Client-Mods zuordnen", "4. 未解決依存と再配布条件": "4. Offene Abhängigkeiten und Weitergabe", "5. 適用計画を確認": "5. Konfigurationsplan prüfen",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "Unbekannte Zielangaben werden nicht automatisch ergänzt. Prüfen Sie das Ziel vor dem Erstellen, wenn Sie das eines bestehenden Servers verwenden.",
    "未確認は作成先へ配置しません": "Unbekannte Mods werden nicht platziert", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "Die Anwendung auf bestehende Server ist nicht implementiert und deaktiviert. Unbekannte, client-only, nicht verfügbare oder nicht weitergabefähige JARs werden nicht kopiert.",
    "確認文字列は計画fingerprintと一致する必要があります。": "Der Bestätigungstext muss mit dem Plan-Fingerprint übereinstimmen.",
  },
  es: {
    "Mod構成の分類": "Categorías de Mods", "サーバー構成の概要": "Resumen de configuración del servidor", "サーバー用": "Para el servidor", "クライアント用": "Para el cliente", "両方": "Ambos", "任意クライアント": "Cliente opcional", "強い根拠": "Evidencia sólida", "弱いヒューリスティック": "Heurística débil", "確認して分類": "Revisar y clasificar", "分類を再確認": "Revisar clasificación",
    "Modパックから新規構成を作成": "Crear una configuración nueva desde un Modpack", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "El origen se analiza en modo de solo lectura. Solo se copian JAR locales verificados a una carpeta nueva y vacía.",
    "1. ファイル／フォルダーを選択": "1. Seleccionar archivo o carpeta", "2. 対象を確認": "2. Revisar el destino", "3. サーバー用／クライアント用を分類": "3. Clasificar Mods de servidor y cliente", "4. 未解決依存と再配布条件": "4. Dependencias pendientes y redistribución", "5. 適用計画を確認": "5. Revisar el plan de configuración",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "Los datos de destino desconocidos no se completan automáticamente. Si usas el destino de un servidor existente, revísalo antes de crear la configuración.",
    "未確認は作成先へ配置しません": "Los elementos desconocidos no se colocan", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "La aplicación a servidores existentes no está implementada y permanece desactivada. No se copian JAR desconocidos, solo de cliente, no disponibles o con redistribución incierta.",
    "確認文字列は計画fingerprintと一致する必要があります。": "El texto de confirmación debe coincidir con la huella del plan.",
  },
  fr: {
    "Mod構成の分類": "Catégories de Mods", "サーバー構成の概要": "Résumé de la configuration du serveur", "サーバー用": "Côté serveur", "クライアント用": "Côté client", "両方": "Les deux", "任意クライアント": "Client facultatif", "強い根拠": "Indice solide", "弱いヒューリスティック": "Heuristique faible", "確認して分類": "Vérifier et classer", "分類を再確認": "Vérifier le classement",
    "Modパックから新規構成を作成": "Créer une configuration depuis un Modpack", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "La source est analysée en lecture seule. Seuls les JAR locaux vérifiés sont copiés dans un nouveau dossier vide.",
    "1. ファイル／フォルダーを選択": "1. Choisir un fichier ou dossier", "2. 対象を確認": "2. Vérifier la cible", "3. サーバー用／クライアント用を分類": "3. Classer les Mods serveur et client", "4. 未解決依存と再配布条件": "4. Dépendances non résolues et redistribution", "5. 適用計画を確認": "5. Vérifier le plan de configuration",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "Les informations de cible inconnues ne sont pas complétées automatiquement. Vérifiez la cible avant création si vous utilisez celle d’un serveur existant.",
    "未確認は作成先へ配置しません": "Les éléments inconnus ne sont pas placés", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "L’application aux serveurs existants n’est pas implémentée et reste désactivée. Les JAR inconnus, client uniquement, indisponibles ou aux droits incertains ne sont pas copiés.",
    "確認文字列は計画fingerprintと一致する必要があります。": "Le texte de confirmation doit correspondre à l’empreinte du plan.",
  },
  ko: {
    "Mod構成の分類": "Mod 분류", "サーバー構成の概要": "서버 구성 요약", "サーバー用": "서버용", "クライアント用": "클라이언트용", "両方": "양쪽", "任意クライアント": "선택적 클라이언트", "強い根拠": "강한 근거", "弱いヒューリスティック": "약한 휴리스틱", "確認して分類": "검토 후 분류", "分類を再確認": "분류 검토",
    "Modパックから新規構成を作成": "Modpack에서 새 구성 만들기", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "입력은 읽기 전용으로 분석합니다. 확인된 로컬 JAR만 새 빈 폴더에 복사합니다.",
    "1. ファイル／フォルダーを選択": "1. 파일 또는 폴더 선택", "2. 対象を確認": "2. 대상 확인", "3. サーバー用／クライアント用を分類": "3. 서버용 및 클라이언트용 Mod 분류", "4. 未解決依存と再配布条件": "4. 해결되지 않은 종속성과 재배포 조건", "5. 適用計画を確認": "5. 구성 계획 확인",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "확인되지 않은 대상 정보는 자동으로 채우지 않습니다. 기존 서버의 대상을 사용한다면 새 구성을 만들기 전에 확인하세요.",
    "未確認は作成先へ配置しません": "확인되지 않은 항목은 배치하지 않습니다", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "기존 서버 적용은 아직 구현되지 않아 비활성화되어 있습니다. 미확인, 클라이언트 전용, 가져올 수 없거나 재배포 조건이 불분명한 JAR은 복사하지 않습니다.",
    "確認文字列は計画fingerprintと一致する必要があります。": "확인 문구는 계획 fingerprint와 일치해야 합니다.",
  },
  "pt-BR": {
    "Mod構成の分類": "Categorias de Mods", "サーバー構成の概要": "Resumo da configuração do servidor", "サーバー用": "Para o servidor", "クライアント用": "Para o cliente", "両方": "Ambos", "任意クライアント": "Cliente opcional", "強い根拠": "Evidência forte", "弱いヒューリスティック": "Heurística fraca", "確認して分類": "Revisar e classificar", "分類を再確認": "Revisar classificação",
    "Modパックから新規構成を作成": "Criar uma nova configuração de um Modpack", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "A origem é analisada em modo somente leitura. Apenas JARs locais verificados são copiados para uma nova pasta vazia.",
    "1. ファイル／フォルダーを選択": "1. Escolher arquivo ou pasta", "2. 対象を確認": "2. Conferir o destino", "3. サーバー用／クライアント用を分類": "3. Classificar Mods de servidor e cliente", "4. 未解決依存と再配布条件": "4. Dependências pendentes e redistribuição", "5. 適用計画を確認": "5. Conferir o plano da configuração",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "Informações desconhecidas do destino não são preenchidas automaticamente. Se usar o destino de um servidor existente, confira-o antes de criar a configuração.",
    "未確認は作成先へ配置しません": "Itens desconhecidos não são colocados", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "A aplicação em servidores existentes não está implementada e permanece desativada. JARs desconhecidos, somente de cliente, indisponíveis ou com redistribuição incerta não são copiados.",
    "確認文字列は計画fingerprintと一致する必要があります。": "O texto de confirmação deve corresponder à impressão digital do plano.",
  },
  "zh-CN": {
    "Mod構成の分類": "Mod 分类", "サーバー構成の概要": "服务器配置概览", "サーバー用": "服务器端", "クライアント用": "客户端", "両方": "两者", "任意クライアント": "可选客户端", "強い根拠": "强证据", "弱いヒューリスティック": "弱启发式证据", "確認して分類": "检查并分类", "分類を再確認": "重新检查分类",
    "Modパックから新規構成を作成": "从 Modpack 创建新配置", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "以只读方式分析输入。仅将已确认的本地 JAR 复制到新的空文件夹。",
    "1. ファイル／フォルダーを選択": "1. 选择文件或文件夹", "2. 対象を確認": "2. 确认目标", "3. サーバー用／クライアント用を分類": "3. 分类服务器端与客户端 Mod", "4. 未解決依存と再配布条件": "4. 未解决依赖与再分发条件", "5. 適用計画を確認": "5. 确认配置计划",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "未知的目标信息不会自动补全。若使用现有服务器的目标，请在创建前确认。",
    "未確認は作成先へ配置しません": "不会放置未确认的项目", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "现有服务器应用功能尚未实现且已禁用。不会复制未知、仅客户端、无法获取或再分发条件不明确的 JAR。",
    "確認文字列は計画fingerprintと一致する必要があります。": "确认文本必须与计划指纹一致。",
  },
  "zh-TW": {
    "Mod構成の分類": "Mod 分類", "サーバー構成の概要": "伺服器設定摘要", "サーバー用": "伺服器端", "クライアント用": "用戶端", "両方": "兩者", "任意クライアント": "選用用戶端", "強い根拠": "強力證據", "弱いヒューリスティック": "弱啟發式證據", "確認して分類": "檢查並分類", "分類を再確認": "重新檢查分類",
    "Modパックから新規構成を作成": "從 Modpack 建立新設定", "入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。": "以唯讀方式分析輸入內容。只會將已確認的本機 JAR 複製到新的空資料夾。",
    "1. ファイル／フォルダーを選択": "1. 選擇檔案或資料夾", "2. 対象を確認": "2. 確認目標", "3. サーバー用／クライアント用を分類": "3. 分類伺服器端與用戶端 Mod", "4. 未解決依存と再配布条件": "4. 未解決相依項目與再散布條件", "5. 適用計画を確認": "5. 確認設定計畫",
    "対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。": "未知的目標資訊不會自動補齊。若使用現有伺服器的目標，請在建立前確認。",
    "未確認は作成先へ配置しません": "不會放置未確認的項目", "既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。": "現有伺服器套用功能尚未實作且已停用。不會複製未知、僅用戶端、無法取得或再散布條件不明的 JAR。",
    "確認文字列は計画fingerprintと一致する必要があります。": "確認文字必須與計畫指紋相符。",
  },
};

const MOD_MANAGEMENT_EXTRA_PATTERNS: Partial<Record<AppLocale, Record<string, string>>> = {
  en: { "[[VAR0]]の復元確認文": "Restore confirmation for [[VAR0]]", "未解決（[[VAR0]]件）": "Unresolved ([[VAR0]])", "[[VAR0]]件": "[[VAR0]] item(s)" },
  de: { "[[VAR0]]の復元確認文": "Wiederherstellungsbestätigung für [[VAR0]]", "未解決（[[VAR0]]件）": "Offen ([[VAR0]])", "[[VAR0]]件": "[[VAR0]] Einträge" },
  es: { "[[VAR0]]の復元確認文": "Confirmación de restauración de [[VAR0]]", "未解決（[[VAR0]]件）": "Sin resolver ([[VAR0]])", "[[VAR0]]件": "[[VAR0]] elemento(s)" },
  fr: { "[[VAR0]]の復元確認文": "Confirmation de restauration pour [[VAR0]]", "未解決（[[VAR0]]件）": "Non résolus ([[VAR0]])", "[[VAR0]]件": "[[VAR0]] élément(s)" },
  ko: { "[[VAR0]]の復元確認文": "[[VAR0]] 복원 확인", "未解決（[[VAR0]]件）": "해결되지 않음 ([[VAR0]])", "[[VAR0]]件": "[[VAR0]]개" },
  "pt-BR": { "[[VAR0]]の復元確認文": "Confirmação de restauração de [[VAR0]]", "未解決（[[VAR0]]件）": "Não resolvidos ([[VAR0]])", "[[VAR0]]件": "[[VAR0]] item(ns)" },
  "zh-CN": { "[[VAR0]]の復元確認文": "[[VAR0]] 的恢复确认", "未解決（[[VAR0]]件）": "未解决（[[VAR0]]）", "[[VAR0]]件": "[[VAR0]] 项" },
  "zh-TW": { "[[VAR0]]の復元確認文": "[[VAR0]] 的還原確認", "未解決（[[VAR0]]件）": "未解決（[[VAR0]]）", "[[VAR0]]件": "[[VAR0]] 項" },
};

const MOD_MANAGEMENT_ACTIONS_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "入力": "Source", "対象": "Target", "分類": "Classification", "未解決／配布": "Dependencies / redistribution", "作成計画": "Setup plan", "戻る": "Back", "次へ": "Next", "閉じる": "Close",
    "Modパックファイルを選択": "Choose Modpack file", "mods／profileフォルダーを選択": "Choose mods / profile folder", "解析中…": "Analyzing…", "選択済み": "Selected", "ZIP安全検査": "ZIP safety checks", "元ファイル不変": "Source files unchanged", "ネットワーク不要": "No network required",
    "未確認のまま": "Leave unclassified", "Mod ID未確認": "Mod ID unknown", "内蔵ID未確認": "Embedded ID unknown", "配布元ID未確認": "Source project ID unknown", "根拠なし · 未確認": "No evidence · unconfirmed", "有効なトップレベルModはありません。": "No active top-level Mods.", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "No confirmed Mods can be listed for the client. Unconfirmed Mods are never included automatically.", "内蔵のためトップレベル重複には数えません": "Embedded items are not counted as top-level duplicates", "内蔵ライブラリは見つかりませんでした。": "No embedded libraries were found.",
    "計画済み": "Planned", "バックアップ済み": "Backed up", "再検査の確認が必要": "Recheck requires review", "復元済み": "Restored", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "Lists client-only, both, and optional-client Mods. JARs are not bundled or copied; only hashes and acquisition details are exported to JSON.", "サーバー用JARをコピー": "Server JARs copied", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "The Modpack was analyzed read-only. Source files were not changed.", "新規構成を作成しました。既存DBへは登録していません": "Created a new setup. It has not been registered in the existing database.",
  },
  de: {
    "入力": "Quelle", "対象": "Ziel", "分類": "Zuordnung", "未解決／配布": "Abhängigkeiten / Weitergabe", "作成計画": "Konfigurationsplan", "戻る": "Zurück", "次へ": "Weiter", "閉じる": "Schließen",
    "Modパックファイルを選択": "Modpack-Datei auswählen", "mods／profileフォルダーを選択": "mods- / Profilordner auswählen", "解析中…": "Wird analysiert…", "選択済み": "Ausgewählt", "ZIP安全検査": "ZIP-Sicherheitsprüfung", "元ファイル不変": "Quelldateien unverändert", "ネットワーク不要": "Kein Netzwerk erforderlich",
    "未確認のまま": "Nicht zuordnen", "Mod ID未確認": "Mod-ID unbekannt", "内蔵ID未確認": "Eingebettete ID unbekannt", "配布元ID未確認": "Quellprojekt-ID unbekannt", "根拠なし · 未確認": "Kein Beleg · ungeprüft", "有効なトップレベルModはありません。": "Keine aktiven Mods direkt im Ordner.", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "Keine bestätigten Mods für den Client. Ungeprüfte Mods werden nie automatisch aufgenommen.", "内蔵のためトップレベル重複には数えません": "Eingebettete Mods zählen nicht als Duplikate auf oberster Ebene", "内蔵ライブラリは見つかりませんでした。": "Keine eingebetteten Bibliotheken gefunden.",
    "計画済み": "Geplant", "バックアップ済み": "Gesichert", "再検査の確認が必要": "Erneute Prüfung erforderlich", "復元済み": "Wiederhergestellt", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "Zeigt client-only, beide und optionale Client-Mods. JARs werden nicht gebündelt oder kopiert; nur Hashes und Bezugsinformationen werden als JSON exportiert.", "サーバー用JARをコピー": "Server-JARs kopiert", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "Das Modpack wurde schreibgeschützt analysiert. Quelldateien wurden nicht geändert.", "新規構成を作成しました。既存DBへは登録していません": "Neue Konfiguration erstellt. Sie wurde nicht in der bestehenden Datenbank registriert.",
  },
  es: {
    "入力": "Origen", "対象": "Destino", "分類": "Clasificación", "未解決／配布": "Dependencias / redistribución", "作成計画": "Plan de configuración", "戻る": "Atrás", "次へ": "Siguiente", "閉じる": "Cerrar",
    "Modパックファイルを選択": "Elegir archivo Modpack", "mods／profileフォルダーを選択": "Elegir carpeta mods / profile", "解析中…": "Analizando…", "選択済み": "Seleccionado", "ZIP安全検査": "Comprobaciones de seguridad ZIP", "元ファイル不変": "Archivos de origen sin cambios", "ネットワーク不要": "No requiere red",
    "未確認のまま": "Dejar sin clasificar", "Mod ID未確認": "ID de Mod desconocido", "内蔵ID未確認": "ID integrado desconocido", "配布元ID未確認": "ID de proyecto de origen desconocido", "根拠なし · 未確認": "Sin pruebas · sin confirmar", "有効なトップレベルModはありません。": "No hay Mods activos en la carpeta principal.", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "No hay Mods confirmados para el cliente. Los Mods sin confirmar nunca se incluyen automáticamente.", "内蔵のためトップレベル重複には数えません": "Los Mods integrados no cuentan como duplicados de nivel superior", "内蔵ライブラリは見つかりませんでした。": "No se encontraron bibliotecas integradas.",
    "計画済み": "Planificada", "バックアップ済み": "Con copia de seguridad", "再検査の確認が必要": "Revisión necesaria tras volver a comprobar", "復元済み": "Restaurada", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "Muestra Mods solo de cliente, ambos y cliente opcional. No se incluyen ni copian JAR; solo se exportan hashes e información de adquisición a JSON.", "サーバー用JARをコピー": "JAR de servidor copiados", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "El Modpack se analizó en modo de solo lectura. No se modificaron los archivos de origen.", "新規構成を作成しました。既存DBへは登録していません": "Se creó una configuración nueva. No se registró en la base de datos existente.",
  },
  fr: {
    "入力": "Source", "対象": "Cible", "分類": "Classement", "未解決／配布": "Dépendances / redistribution", "作成計画": "Plan de configuration", "戻る": "Retour", "次へ": "Suivant", "閉じる": "Fermer",
    "Modパックファイルを選択": "Choisir un fichier Modpack", "mods／profileフォルダーを選択": "Choisir un dossier mods / profil", "解析中…": "Analyse…", "選択済み": "Sélectionné", "ZIP安全検査": "Contrôles de sécurité ZIP", "元ファイル不変": "Fichiers source inchangés", "ネットワーク不要": "Aucun réseau requis",
    "未確認のまま": "Laisser sans classement", "Mod ID未確認": "ID du Mod inconnue", "内蔵ID未確認": "ID intégrée inconnue", "配布元ID未確認": "ID du projet source inconnue", "根拠なし · 未確認": "Aucun indice · non confirmé", "有効なトップレベルModはありません。": "Aucun Mod actif à la racine.", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "Aucun Mod confirmé à proposer au client. Les Mods non confirmés ne sont jamais inclus automatiquement.", "内蔵のためトップレベル重複には数えません": "Les éléments intégrés ne comptent pas comme doublons à la racine", "内蔵ライブラリは見つかりませんでした。": "Aucune bibliothèque intégrée trouvée.",
    "計画済み": "Planifié", "バックアップ済み": "Sauvegardé", "再検査の確認が必要": "Nouvelle vérification requise", "復元済み": "Restauré", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "Affiche les Mods client uniquement, les deux et client facultatif. Aucun JAR n’est inclus ou copié ; seuls les empreintes et détails d’acquisition sont exportés en JSON.", "サーバー用JARをコピー": "JAR serveur copiés", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "Le Modpack a été analysé en lecture seule. Les fichiers source n’ont pas été modifiés.", "新規構成を作成しました。既存DBへは登録していません": "Nouvelle configuration créée. Elle n’a pas été inscrite dans la base existante.",
  },
  ko: {
    "入力": "입력", "対象": "대상", "分類": "분류", "未解決／配布": "미해결 종속성 / 재배포", "作成計画": "구성 계획", "戻る": "뒤로", "次へ": "다음", "閉じる": "닫기",
    "Modパックファイルを選択": "Modpack 파일 선택", "mods／profileフォルダーを選択": "mods / 프로필 폴더 선택", "解析中…": "분석 중…", "選択済み": "선택됨", "ZIP安全検査": "ZIP 안전 검사", "元ファイル不変": "원본 파일 변경 없음", "ネットワーク不要": "네트워크 불필요",
    "未確認のまま": "미분류 상태로 두기", "Mod ID未確認": "Mod ID 확인 안 됨", "内蔵ID未確認": "내장 ID 확인 안 됨", "配布元ID未確認": "소스 프로젝트 ID 확인 안 됨", "根拠なし · 未確認": "근거 없음 · 확인 안 됨", "有効なトップレベルModはありません。": "활성화된 최상위 Mod가 없습니다.", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "클라이언트에 안내할 확인된 Mod가 없습니다. 확인되지 않은 Mod는 자동으로 포함하지 않습니다.", "内蔵のためトップレベル重複には数えません": "내장 항목은 최상위 중복으로 계산하지 않습니다", "内蔵ライブラリは見つかりませんでした。": "내장 라이브러리를 찾지 못했습니다.",
    "計画済み": "계획됨", "バックアップ済み": "백업 완료", "再検査の確認が必要": "재검사 확인 필요", "復元済み": "복원 완료", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "클라이언트 전용, 양쪽, 선택적 클라이언트 Mod만 안내합니다. JAR은 포함하거나 복사하지 않고 해시와 획득 정보만 JSON으로 내보냅니다.", "サーバー用JARをコピー": "서버용 JAR 복사됨", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "Modpack을 읽기 전용으로 분석했습니다. 원본 파일은 변경하지 않았습니다.", "新規構成を作成しました。既存DBへは登録していません": "새 구성을 만들었습니다. 기존 데이터베이스에는 등록하지 않았습니다.",
  },
  "pt-BR": {
    "入力": "Origem", "対象": "Destino", "分類": "Classificação", "未解決／配布": "Dependências / redistribuição", "作成計画": "Plano da configuração", "戻る": "Voltar", "次へ": "Avançar", "閉じる": "Fechar",
    "Modパックファイルを選択": "Escolher arquivo Modpack", "mods／profileフォルダーを選択": "Escolher pasta mods / perfil", "解析中…": "Analisando…", "選択済み": "Selecionado", "ZIP安全検査": "Verificações de segurança ZIP", "元ファイル不変": "Arquivos de origem inalterados", "ネットワーク不要": "Sem necessidade de rede",
    "未確認のまま": "Manter sem classificação", "Mod ID未確認": "ID do Mod desconhecido", "内蔵ID未確認": "ID incorporado desconhecido", "配布元ID未確認": "ID do projeto de origem desconhecido", "根拠なし · 未確認": "Sem evidência · não confirmado", "有効なトップレベルModはありません。": "Não há Mods ativos na pasta principal.", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "Não há Mods confirmados para o cliente. Mods não confirmados nunca são incluídos automaticamente.", "内蔵のためトップレベル重複には数えません": "Itens incorporados não contam como duplicatas de nível superior", "内蔵ライブラリは見つかりませんでした。": "Nenhuma biblioteca incorporada foi encontrada.",
    "計画済み": "Planejado", "バックアップ済み": "Com backup", "再検査の確認が必要": "Nova verificação necessária", "復元済み": "Restaurado", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "Mostra Mods somente de cliente, ambos e cliente opcional. JARs não são incluídos nem copiados; apenas hashes e informações de obtenção são exportados em JSON.", "サーバー用JARをコピー": "JARs de servidor copiados", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "O Modpack foi analisado em modo somente leitura. Os arquivos de origem não foram alterados.", "新規構成を作成しました。既存DBへは登録していません": "Nova configuração criada. Ela não foi registrada no banco de dados existente.",
  },
  "zh-CN": {
    "入力": "来源", "対象": "目标", "分類": "分类", "未解決／配布": "依赖 / 再分发", "作成計画": "配置计划", "戻る": "返回", "次へ": "下一步", "閉じる": "关闭",
    "Modパックファイルを選択": "选择 Modpack 文件", "mods／profileフォルダーを選択": "选择 mods / profile 文件夹", "解析中…": "正在分析…", "選択済み": "已选择", "ZIP安全検査": "ZIP 安全检查", "元ファイル不変": "源文件未更改", "ネットワーク不要": "无需网络",
    "未確認のまま": "保持未分类", "Mod ID未確認": "Mod ID 未知", "内蔵ID未確認": "内置 ID 未知", "配布元ID未確認": "来源项目 ID 未知", "根拠なし · 未確認": "无证据 · 未确认", "有効なトップレベルModはありません。": "mods 顶层没有启用的 Mod。", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "没有可提供给客户端的已确认 Mod。未经确认的 Mod 不会自动包含。", "内蔵のためトップレベル重複には数えません": "内置项目不计为顶层重复项", "内蔵ライブラリは見つかりませんでした。": "未找到内置库。",
    "計画済み": "已计划", "バックアップ済み": "已备份", "再検査の確認が必要": "需要重新检查", "復元済み": "已恢复", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "仅列出客户端专用、双方和可选客户端 Mod。不会打包或复制 JAR；仅将哈希和获取信息导出为 JSON。", "サーバー用JARをコピー": "已复制的服务器端 JAR", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "已只读分析 Modpack。源文件未更改。", "新規構成を作成しました。既存DBへは登録していません": "已创建新配置。未注册到现有数据库。",
  },
  "zh-TW": {
    "入力": "來源", "対象": "目標", "分類": "分類", "未解決／配布": "相依項目 / 再散布", "作成計画": "設定計畫", "戻る": "返回", "次へ": "下一步", "閉じる": "關閉",
    "Modパックファイルを選択": "選擇 Modpack 檔案", "mods／profileフォルダーを選択": "選擇 mods / profile 資料夾", "解析中…": "分析中…", "選択済み": "已選取", "ZIP安全検査": "ZIP 安全檢查", "元ファイル不変": "來源檔案未變更", "ネットワーク不要": "不需網路",
    "未確認のまま": "維持未分類", "Mod ID未確認": "Mod ID 未知", "内蔵ID未確認": "內嵌 ID 未知", "配布元ID未確認": "來源專案 ID 未知", "根拠なし · 未確認": "無證據 · 未確認", "有効なトップレベルModはありません。": "mods 頂層沒有啟用的 Mod。", "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。": "沒有可提供給用戶端的已確認 Mod。未確認的 Mod 不會自動包含。", "内蔵のためトップレベル重複には数えません": "內嵌項目不計為頂層重複項", "内蔵ライブラリは見つかりませんでした。": "找不到內嵌程式庫。",
    "計画済み": "已規劃", "バックアップ済み": "已備份", "再検査の確認が必要": "需要重新檢查", "復元済み": "已還原", "client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。": "僅列出用戶端專用、雙方及選用用戶端 Mod。不會隨附或複製 JAR；只會將雜湊與取得資訊匯出為 JSON。", "サーバー用JARをコピー": "已複製的伺服器端 JAR", "Modパックを読み取り専用で解析しました。元ファイルは変更していません": "已以唯讀方式分析 Modpack。來源檔案未變更。", "新規構成を作成しました。既存DBへは登録していません": "已建立新設定。未登錄至現有資料庫。",
  },
};

// Technical terms in Server Lab need deliberate translations. Generic machine
// translation tends to interpret Minecraft "ports", "chunks", and "seeds" as
// harbours, pieces, and agriculture.
const SERVER_LAB_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "サーバーラボ": "Server Lab",
    "遊び方プリセット": "Game-mode presets",
    "性能プリセット": "Performance presets",
    "人数・メモリプランナー": "Player & memory planner",
    "チャンク・保護範囲の推定": "Chunk & spawn-protection estimate",
    "ワールドシード生成": "World seed generator",
    "ポート検査と提案": "Port check & suggestion",
    "公開前セキュリティ監査": "Pre-publish security audit",
    "未保存の変更差分": "Unsaved changes",
    "server.properties変更案": "server.properties change proposal",
    "バックアップして全変更を保存": "Back up & save all changes",
  },
  de: {
    "サーバーラボ": "Serverlabor",
    "遊び方プリセット": "Spielstil-Voreinstellungen",
    "性能プリセット": "Leistungsvoreinstellungen",
    "人数・メモリプランナー": "Spieler- und Arbeitsspeicherplaner",
    "チャンク・保護範囲の推定": "Chunk- und Spawnschutz-Schätzung",
    "ワールドシード生成": "Welt-Seed-Generator",
    "ポート検査と提案": "Portprüfung und -vorschlag",
    "公開前セキュリティ監査": "Sicherheitsprüfung vor der Freigabe",
    "未保存の変更差分": "Ungespeicherte Änderungen",
    "server.properties変更案": "server.properties-Änderungsvorschlag",
    "バックアップして全変更を保存": "Sicherung erstellen und alle Änderungen speichern",
  },
  es: {
    "サーバーラボ": "Laboratorio del servidor",
    "遊び方プリセット": "Preajustes de juego",
    "性能プリセット": "Preajustes de rendimiento",
    "人数・メモリプランナー": "Planificador de jugadores y memoria",
    "チャンク・保護範囲の推定": "Estimación de chunks y protección del spawn",
    "ワールドシード生成": "Generador de semilla del mundo",
    "ポート検査と提案": "Comprobación y sugerencia de puerto",
    "公開前セキュリティ監査": "Auditoría de seguridad antes de publicar",
    "未保存の変更差分": "Cambios sin guardar",
    "server.properties変更案": "Propuesta de cambios de server.properties",
    "バックアップして全変更を保存": "Crear copia y guardar todos los cambios",
  },
  fr: {
    "サーバーラボ": "Laboratoire serveur",
    "遊び方プリセット": "Préréglages de jeu",
    "性能プリセット": "Préréglages de performances",
    "人数・メモリプランナー": "Planificateur de joueurs et de mémoire",
    "チャンク・保護範囲の推定": "Estimation des chunks et de la protection du spawn",
    "ワールドシード生成": "Générateur de graine du monde",
    "ポート検査と提案": "Vérification et suggestion de port",
    "公開前セキュリティ監査": "Audit de sécurité avant publication",
    "未保存の変更差分": "Modifications non enregistrées",
    "server.properties変更案": "Proposition de modification de server.properties",
    "バックアップして全変更を保存": "Sauvegarder et enregistrer toutes les modifications",
  },
  ko: {
    "サーバーラボ": "서버 랩",
    "遊び方プリセット": "플레이 방식 프리셋",
    "性能プリセット": "성능 프리셋",
    "人数・メモリプランナー": "플레이어 및 메모리 플래너",
    "チャンク・保護範囲の推定": "청크 및 스폰 보호 범위 추정",
    "ワールドシード生成": "월드 시드 생성기",
    "ポート検査と提案": "포트 검사 및 제안",
    "公開前セキュリティ監査": "공개 전 보안 점검",
    "未保存の変更差分": "저장되지 않은 변경 사항",
    "server.properties変更案": "server.properties 변경 제안",
    "バックアップして全変更を保存": "백업 후 모든 변경 사항 저장",
  },
  "pt-BR": {
    "サーバーラボ": "Laboratório do servidor",
    "遊び方プリセット": "Predefinições de jogo",
    "性能プリセット": "Predefinições de desempenho",
    "人数・メモリプランナー": "Planejador de jogadores e memória",
    "チャンク・保護範囲の推定": "Estimativa de chunks e proteção do spawn",
    "ワールドシード生成": "Gerador de semente do mundo",
    "ポート検査と提案": "Verificação e sugestão de porta",
    "公開前セキュリティ監査": "Auditoria de segurança antes da publicação",
    "未保存の変更差分": "Alterações não salvas",
    "server.properties変更案": "Proposta de alteração de server.properties",
    "バックアップして全変更を保存": "Fazer backup e salvar todas as alterações",
  },
  "zh-CN": {
    "サーバーラボ": "服务器实验室",
    "遊び方プリセット": "玩法预设",
    "性能プリセット": "性能预设",
    "人数・メモリプランナー": "玩家人数与内存规划器",
    "チャンク・保護範囲の推定": "区块与出生点保护范围估算",
    "ワールドシード生成": "世界种子生成器",
    "ポート検査と提案": "端口检查与建议",
    "公開前セキュリティ監査": "公开前安全检查",
    "未保存の変更差分": "未保存的更改",
    "server.properties変更案": "server.properties 更改建议",
    "バックアップして全変更を保存": "备份并保存所有更改",
  },
  "zh-TW": {
    "サーバーラボ": "伺服器實驗室",
    "遊び方プリセット": "玩法預設",
    "性能プリセット": "效能預設",
    "人数・メモリプランナー": "玩家人數與記憶體規劃器",
    "チャンク・保護範囲の推定": "區塊與出生點保護範圍估算",
    "ワールドシード生成": "世界種子產生器",
    "ポート検査と提案": "連接埠檢查與建議",
    "公開前セキュリティ監査": "公開前安全檢查",
    "未保存の変更差分": "未儲存的變更",
    "server.properties変更案": "server.properties 變更建議",
    "バックアップして全変更を保存": "備份並儲存所有變更",
  },
};

const CURATED_PATTERNS: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "確認のため「[[VAR0]]」と入力": "For confirmation, enter \"[[VAR0]]\"",
    "人気の[[VAR0]]": "Popular [[VAR0]]",
    "[[VAR0]]を探して導入": "Find and install [[VAR0]]",
    "人気の[[VAR0]]を読み込んでいます": "Loading popular [[VAR0]]…",
    "[[VAR0]] / [[VAR1]] 対応 · ダウンロード数順": "[[VAR0]] / [[VAR1]] compatible · Sorted by downloads",
    "追加済みの[[VAR0]]はありません。": "No [[VAR0]] installed.",
    "[[VAR0]] / [[VAR1]] に合う項目だけを表示します": "Show only items compatible with [[VAR0]] / [[VAR1]]",
    "このサーバー構成に合う[[VAR0]]は見つかりませんでした。": "No compatible [[VAR0]] was found for this server.",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "Java [[VAR0]] or later is required. Current version: Java [[VAR1]].",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "The backup destination does not have enough free space. At least about [[VAR0]] MiB is required.",
  },
  de: {
    "確認のため「[[VAR0]]」と入力": "Geben Sie zur Bestätigung \"[[VAR0]]\" ein",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "Java [[VAR0]] oder neuer ist erforderlich. Aktuell ist Java [[VAR1]] ausgewählt.",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "Am Sicherungsziel ist nicht genügend Speicherplatz frei. Mindestens etwa [[VAR0]] MiB sind erforderlich.",
  },
  es: {
    "確認のため「[[VAR0]]」と入力": "Para confirmar, escribe \"[[VAR0]]\"",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "Se requiere Java [[VAR0]] o posterior. Actualmente está seleccionado Java [[VAR1]].",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "El destino de la copia de seguridad no tiene suficiente espacio libre. Se requieren al menos unos [[VAR0]] MiB.",
  },
  fr: {
    "確認のため「[[VAR0]]」と入力": "Pour confirmer, saisissez \"[[VAR0]]\"",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "Java [[VAR0]] ou version ultérieure est requis. Java [[VAR1]] est actuellement sélectionné.",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "L’emplacement de sauvegarde ne dispose pas d’assez d’espace libre. Environ [[VAR0]] Mio au minimum sont nécessaires.",
  },
  ko: {
    "確認のため「[[VAR0]]」と入力": "확인을 위해 \"[[VAR0]]\"를 입력하세요",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "Java [[VAR0]] 이상이 필요합니다. 현재 Java [[VAR1]]이 선택되어 있습니다.",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "백업 위치의 여유 공간이 부족합니다. 최소 약 [[VAR0]] MiB가 필요합니다.",
  },
  "pt-BR": {
    "確認のため「[[VAR0]]」と入力": "Para confirmar, digite \"[[VAR0]]\"",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "É necessário Java [[VAR0]] ou posterior. Atualmente, o Java [[VAR1]] está selecionado.",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "O destino do backup não tem espaço livre suficiente. São necessários pelo menos cerca de [[VAR0]] MiB.",
  },
  "zh-CN": {
    "確認のため「[[VAR0]]」と入力": "请输入“[[VAR0]]”以确认",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "需要 Java [[VAR0]] 或更高版本。当前选择的是 Java [[VAR1]]。",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "备份位置的可用空间不足。至少需要约 [[VAR0]] MiB。",
  },
  "zh-TW": {
    "確認のため「[[VAR0]]」と入力": "請輸入「[[VAR0]]」以確認",
    "Java [[VAR0]]以上が必要です。現在はJava [[VAR1]]です": "需要 Java [[VAR0]] 或更新版本。目前選擇的是 Java [[VAR1]]。",
    "バックアップ先の空き容量が不足しています。少なくとも約[[VAR0]] MiB必要です": "備份位置的可用空間不足。至少需要約 [[VAR0]] MiB。",
  },
};

const MEMORY_HELP_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: { "1〜16 GiBから選べるJava起動設定": "Java launch memory selectable from 1 to 16 GiB" },
  de: { "1〜16 GiBから選べるJava起動設定": "Java-Startspeicher von 1 bis 16 GiB auswählbar" },
  es: { "1〜16 GiBから選べるJava起動設定": "Memoria de inicio de Java seleccionable de 1 a 16 GiB" },
  fr: { "1〜16 GiBから選べるJava起動設定": "Mémoire de lancement Java réglable de 1 à 16 Gio" },
  ko: { "1〜16 GiBから選べるJava起動設定": "1~16 GiB에서 선택할 수 있는 Java 실행 메모리" },
  "pt-BR": { "1〜16 GiBから選べるJava起動設定": "Memória de inicialização do Java selecionável de 1 a 16 GiB" },
  "zh-CN": { "1〜16 GiBから選べるJava起動設定": "可选择 1 到 16 GiB 的 Java 启动内存" },
  "zh-TW": { "1〜16 GiBから選べるJava起動設定": "可選擇 1 到 16 GiB 的 Java 啟動記憶體" },
};

const PLAYER_STATUS_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: { "現在参加しているプレイヤー": "Players online now", "Java版またはGeyser経由のプレイヤー": "Java player or player connected through Geyser", "現在参加しているプレイヤーはいません。": "No players are currently online.", "サーバー起動後に参加中のプレイヤーが表示されます。": "Online players will appear after the server starts." },
  de: { "現在参加しているプレイヤー": "Derzeit verbundene Spieler", "Java版またはGeyser経由のプレイヤー": "Java-Spieler oder über Geyser verbunden", "現在参加しているプレイヤーはいません。": "Derzeit sind keine Spieler verbunden.", "サーバー起動後に参加中のプレイヤーが表示されます。": "Verbundene Spieler werden nach dem Serverstart angezeigt." },
  es: { "現在参加しているプレイヤー": "Jugadores conectados ahora", "Java版またはGeyser経由のプレイヤー": "Jugador de Java o conectado mediante Geyser", "現在参加しているプレイヤーはいません。": "No hay jugadores conectados ahora.", "サーバー起動後に参加中のプレイヤーが表示されます。": "Los jugadores conectados aparecerán después de iniciar el servidor." },
  fr: { "現在参加しているプレイヤー": "Joueurs actuellement connectés", "Java版またはGeyser経由のプレイヤー": "Joueur Java ou connecté via Geyser", "現在参加しているプレイヤーはいません。": "Aucun joueur n’est actuellement connecté.", "サーバー起動後に参加中のプレイヤーが表示されます。": "Les joueurs connectés apparaîtront après le démarrage du serveur." },
  ko: { "現在参加しているプレイヤー": "현재 접속 중인 플레이어", "Java版またはGeyser経由のプレイヤー": "Java 플레이어 또는 Geyser를 통해 접속한 플레이어", "現在参加しているプレイヤーはいません。": "현재 접속 중인 플레이어가 없습니다.", "サーバー起動後に参加中のプレイヤーが表示されます。": "서버를 시작하면 접속 중인 플레이어가 표시됩니다." },
  "pt-BR": { "現在参加しているプレイヤー": "Jogadores conectados agora", "Java版またはGeyser経由のプレイヤー": "Jogador Java ou conectado pelo Geyser", "現在参加しているプレイヤーはいません。": "Nenhum jogador está conectado agora.", "サーバー起動後に参加中のプレイヤーが表示されます。": "Os jogadores conectados aparecerão após iniciar o servidor." },
  "zh-CN": { "現在参加しているプレイヤー": "当前在线玩家", "Java版またはGeyser経由のプレイヤー": "Java 版玩家或通过 Geyser 连接的玩家", "現在参加しているプレイヤーはいません。": "当前没有在线玩家。", "サーバー起動後に参加中のプレイヤーが表示されます。": "服务器启动后会显示在线玩家。" },
  "zh-TW": { "現在参加しているプレイヤー": "目前線上玩家", "Java版またはGeyser経由のプレイヤー": "Java 版玩家或透過 Geyser 連線的玩家", "現在参加しているプレイヤーはいません。": "目前沒有線上玩家。", "サーバー起動後に参加中のプレイヤーが表示されます。": "伺服器啟動後會顯示線上玩家。" },
};

const CROSSPLAY_ACCESS_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: { "統合版ホワイトリスト": "Bedrock whitelist", "Geyser／Floodgateから参加するプレイヤー": "Players joining through Geyser / Floodgate", "統合版プレイヤーを追加": "Add Bedrock player", "Xboxゲーマータグ（接頭辞は不要）": "Xbox gamertag (no prefix needed)", "Xboxゲーマータグ": "Xbox gamertag", "Floodgate専用": "Floodgate only", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "Uses the official fwhitelist command. Enter the Xbox gamertag without the configured prefix. Floodgate must be installed before adding players.", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "Only players whose Floodgate UUID can be confirmed through the official GeyserMC profile service are safely saved to whitelist.json. If confirmation fails, start the server and try again." },
  de: { "統合版ホワイトリスト": "Bedrock-Whitelist", "Geyser／Floodgateから参加するプレイヤー": "Spieler über Geyser / Floodgate", "統合版プレイヤーを追加": "Bedrock-Spieler hinzufügen", "Xboxゲーマータグ（接頭辞は不要）": "Xbox-Gamertag (kein Präfix nötig)", "Xboxゲーマータグ": "Xbox-Gamertag", "Floodgate専用": "Nur Floodgate", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "Verwendet den offiziellen Befehl fwhitelist. Gib den Xbox-Gamertag ohne das konfigurierte Präfix ein. Floodgate muss installiert sein.", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "Nur Spieler mit einer über den offiziellen GeyserMC-Profildienst bestätigten Floodgate-UUID werden sicher in whitelist.json gespeichert. Starte andernfalls den Server und versuche es erneut." },
  es: { "統合版ホワイトリスト": "Lista blanca de Bedrock", "Geyser／Floodgateから参加するプレイヤー": "Jugadores que entran mediante Geyser / Floodgate", "統合版プレイヤーを追加": "Añadir jugador de Bedrock", "Xboxゲーマータグ（接頭辞は不要）": "Gamertag de Xbox (sin prefijo)", "Xboxゲーマータグ": "Gamertag de Xbox", "Floodgate専用": "Solo Floodgate", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "Usa el comando oficial fwhitelist. Introduce el gamertag de Xbox sin el prefijo configurado. Floodgate debe estar instalado.", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "Solo se guardan en whitelist.json los jugadores cuyo UUID de Floodgate pueda confirmarse mediante el servicio oficial de perfiles de GeyserMC. Si falla, inicia el servidor e inténtalo de nuevo." },
  fr: { "統合版ホワイトリスト": "Liste blanche Bedrock", "Geyser／Floodgateから参加するプレイヤー": "Joueurs via Geyser / Floodgate", "統合版プレイヤーを追加": "Ajouter un joueur Bedrock", "Xboxゲーマータグ（接頭辞は不要）": "Gamertag Xbox (sans préfixe)", "Xboxゲーマータグ": "Gamertag Xbox", "Floodgate専用": "Floodgate uniquement", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "Utilise la commande officielle fwhitelist. Saisissez le gamertag Xbox sans le préfixe configuré. Floodgate doit être installé.", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "Seuls les joueurs dont l’UUID Floodgate est confirmé par le service de profils officiel GeyserMC sont enregistrés dans whitelist.json. Sinon, démarrez le serveur et réessayez." },
  ko: { "統合版ホワイトリスト": "베드락 화이트리스트", "Geyser／Floodgateから参加するプレイヤー": "Geyser / Floodgate로 접속하는 플레이어", "統合版プレイヤーを追加": "베드락 플레이어 추가", "Xboxゲーマータグ（接頭辞は不要）": "Xbox 게이머태그(접두사 불필요)", "Xboxゲーマータグ": "Xbox 게이머태그", "Floodgate専用": "Floodgate 전용", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "공식 fwhitelist 명령을 사용합니다. 설정된 접두사 없이 Xbox 게이머태그를 입력하세요. 플레이어를 추가하려면 Floodgate가 필요합니다.", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "GeyserMC 공식 프로필 서비스에서 Floodgate UUID가 확인된 플레이어만 whitelist.json에 안전하게 저장합니다. 확인되지 않으면 서버를 시작한 뒤 다시 시도하세요." },
  "pt-BR": { "統合版ホワイトリスト": "Lista de permissões Bedrock", "Geyser／Floodgateから参加するプレイヤー": "Jogadores que entram pelo Geyser / Floodgate", "統合版プレイヤーを追加": "Adicionar jogador Bedrock", "Xboxゲーマータグ（接頭辞は不要）": "Gamertag do Xbox (sem prefixo)", "Xboxゲーマータグ": "Gamertag do Xbox", "Floodgate専用": "Somente Floodgate", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "Usa o comando oficial fwhitelist. Digite o gamertag do Xbox sem o prefixo configurado. O Floodgate precisa estar instalado.", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "Somente jogadores com UUID Floodgate confirmado pelo serviço oficial de perfis do GeyserMC são salvos com segurança no whitelist.json. Se falhar, inicie o servidor e tente novamente." },
  "zh-CN": { "統合版ホワイトリスト": "基岩版白名单", "Geyser／Floodgateから参加するプレイヤー": "通过 Geyser / Floodgate 加入的玩家", "統合版プレイヤーを追加": "添加基岩版玩家", "Xboxゲーマータグ（接頭辞は不要）": "Xbox 玩家代号（无需前缀）", "Xboxゲーマータグ": "Xbox 玩家代号", "Floodgate専用": "仅限 Floodgate", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "使用官方 fwhitelist 命令。请输入不带配置前缀的 Xbox 玩家代号。添加玩家前必须安装 Floodgate。", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "只有能通过 GeyserMC 官方档案服务确认 Floodgate UUID 的玩家才会安全保存到 whitelist.json。若无法确认，请启动服务器后重试。" },
  "zh-TW": { "統合版ホワイトリスト": "基岩版白名單", "Geyser／Floodgateから参加するプレイヤー": "透過 Geyser / Floodgate 加入的玩家", "統合版プレイヤーを追加": "新增基岩版玩家", "Xboxゲーマータグ（接頭辞は不要）": "Xbox 玩家代號（不需前綴）", "Xboxゲーマータグ": "Xbox 玩家代號", "Floodgate専用": "僅限 Floodgate", "公式のfwhitelistを使用します。Xboxゲーマータグに設定上の接頭辞を付けずに入力してください。追加にはFloodgateの導入が必要です。": "使用官方 fwhitelist 指令。請輸入不含設定前綴的 Xbox 玩家代號。新增玩家前必須安裝 Floodgate。", "GeyserMC公式プロフィールサービスでFloodgate UUIDを確認できるプレイヤーだけ、安全にwhitelist.jsonへ保存します。確認できない場合はサーバー起動後に再試行してください。": "只有可透過 GeyserMC 官方個人資料服務確認 Floodgate UUID 的玩家才會安全儲存到 whitelist.json。若無法確認，請啟動伺服器後重試。" },
};

const FIXED_MEMBER_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: { "統合版専用のいつものメンバー": "Regular Bedrock players" },
  de: { "統合版専用のいつものメンバー": "Regelmäßige Bedrock-Spieler" },
  es: { "統合版専用のいつものメンバー": "Jugadores habituales de Bedrock" },
  fr: { "統合版専用のいつものメンバー": "Joueurs Bedrock habituels" },
  ko: { "統合版専用のいつものメンバー": "베드락 전용 고정 멤버" },
  "pt-BR": { "統合版専用のいつものメンバー": "Jogadores Bedrock frequentes" },
  "zh-CN": { "統合版専用のいつものメンバー": "常用基岩版成员" },
  "zh-TW": { "統合版専用のいつものメンバー": "常用基岩版成員" },
};

const BEDROCK_ENDPOINT_EXACT: Partial<Record<AppLocale, Record<string, string>>> = {
  en: {
    "統合版の友達が入力する内容": "What your Bedrock friend should enter",
    "Minecraft統合版では、アドレスとポートを別々に入力します": "In Minecraft Bedrock, enter the address and port separately",
    "サーバーアドレス": "Server Address",
    "サーバーポート": "Server Port",
    "アドレスをコピー": "Copy address",
    "ポートをコピー": "Copy port",
    "未取得": "Not available",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "Do not leave the Java port 25565 in Bedrock's Server Port field. Enter the Bedrock port shown above.",
    "「プレイ」を開く": "Open Play",
    "「サーバー」→「サーバーを追加」を選ぶ": "Select Servers, then Add Server",
    "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "Enter the Server Address and Server Port shown above in their matching fields",
    "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "The port could not be separated from the public endpoint. Check the Minecraft Bedrock / UDP settings in playit.gg.",
    "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Java Edition friends should use the usual Java address, not the values shown here.",
  },
  de: {
    "統合版の友達が入力する内容": "Eingaben für deinen Bedrock-Freund",
    "Minecraft統合版では、アドレスとポートを別々に入力します": "In Minecraft Bedrock werden Adresse und Port getrennt eingegeben",
    "サーバーアドレス": "Serveradresse", "サーバーポート": "Serverport", "アドレスをコピー": "Adresse kopieren", "ポートをコピー": "Port kopieren", "未取得": "Nicht verfügbar",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "Lass im Bedrock-Feld Serverport nicht den Java-Port 25565 stehen. Gib den oben angezeigten Bedrock-Port ein.",
    "「プレイ」を開く": "Spielen öffnen", "「サーバー」→「サーバーを追加」を選ぶ": "Server und dann Server hinzufügen wählen", "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "Serveradresse und Serverport von oben in die passenden Felder eingeben",
    "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "Der Port konnte nicht vom öffentlichen Endpunkt getrennt werden. Prüfe die Minecraft-Bedrock-/UDP-Einstellungen in playit.gg.",
    "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Freunde mit der Java Edition verwenden die normale Java-Adresse, nicht die hier angezeigten Werte.",
  },
  es: {
    "統合版の友達が入力する内容": "Datos que debe introducir tu amigo de Bedrock",
    "Minecraft統合版では、アドレスとポートを別々に入力します": "En Minecraft Bedrock, introduce la dirección y el puerto por separado",
    "サーバーアドレス": "Dirección del servidor", "サーバーポート": "Puerto del servidor", "アドレスをコピー": "Copiar dirección", "ポートをコピー": "Copiar puerto", "未取得": "No disponible",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "No dejes el puerto 25565 de Java en el campo Puerto del servidor de Bedrock. Introduce el puerto de Bedrock mostrado arriba.",
    "「プレイ」を開く": "Abre Jugar", "「サーバー」→「サーバーを追加」を選ぶ": "Selecciona Servidores y luego Agregar servidor", "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "Introduce la Dirección y el Puerto mostrados arriba en sus campos correspondientes",
    "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "No se pudo separar el puerto del destino público. Revisa la configuración Minecraft Bedrock / UDP en playit.gg.",
    "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Los amigos con Java Edition deben usar la dirección habitual de Java, no estos valores.",
  },
  fr: {
    "統合版の友達が入力する内容": "Informations à saisir par votre ami Bedrock",
    "Minecraft統合版では、アドレスとポートを別々に入力します": "Dans Minecraft Bedrock, saisissez séparément l’adresse et le port",
    "サーバーアドレス": "Adresse du serveur", "サーバーポート": "Port du serveur", "アドレスをコピー": "Copier l’adresse", "ポートをコピー": "Copier le port", "未取得": "Indisponible",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "Ne laissez pas le port Java 25565 dans le champ Port du serveur Bedrock. Saisissez le port Bedrock affiché ci-dessus.",
    "「プレイ」を開く": "Ouvrez Jouer", "「サーバー」→「サーバーを追加」を選ぶ": "Choisissez Serveurs, puis Ajouter un serveur", "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "Saisissez l’adresse et le port affichés ci-dessus dans les champs correspondants",
    "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "Impossible de séparer le port de l’adresse publique. Vérifiez les réglages Minecraft Bedrock / UDP dans playit.gg.",
    "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Les amis sur Java Edition doivent utiliser l’adresse Java habituelle, pas les valeurs affichées ici.",
  },
  ko: {
    "統合版の友達が入力する内容": "베드락 친구가 입력할 내용",
    "Minecraft統合版では、アドレスとポートを別々に入力します": "Minecraft 베드락에서는 주소와 포트를 따로 입력합니다",
    "サーバーアドレス": "서버 주소", "サーバーポート": "서버 포트", "アドレスをコピー": "주소 복사", "ポートをコピー": "포트 복사", "未取得": "가져오지 못함",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "베드락의 서버 포트 칸에 Java용 25565를 그대로 두지 말고 위에 표시된 베드락용 포트를 입력하세요.",
    "「プレイ」を開く": "플레이 열기", "「サーバー」→「サーバーを追加」を選ぶ": "서버에서 서버 추가 선택", "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "위의 서버 주소와 서버 포트를 각각 맞는 칸에 입력",
    "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "공개 주소에서 포트를 분리하지 못했습니다. playit.gg의 Minecraft Bedrock / UDP 설정을 확인하세요.",
    "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Java Edition 친구는 여기에 표시된 값이 아니라 기존 Java용 주소를 사용합니다.",
  },
  "pt-BR": {
    "統合版の友達が入力する内容": "Dados que seu amigo Bedrock deve inserir",
    "Minecraft統合版では、アドレスとポートを別々に入力します": "No Minecraft Bedrock, informe o endereço e a porta separadamente",
    "サーバーアドレス": "Endereço do servidor", "サーバーポート": "Porta do servidor", "アドレスをコピー": "Copiar endereço", "ポートをコピー": "Copiar porta", "未取得": "Indisponível",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "Não deixe a porta Java 25565 no campo Porta do servidor do Bedrock. Informe a porta Bedrock mostrada acima.",
    "「プレイ」を開く": "Abra Jogar", "「サーバー」→「サーバーを追加」を選ぶ": "Selecione Servidores e depois Adicionar servidor", "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "Informe o endereço e a porta mostrados acima nos campos correspondentes",
    "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "Não foi possível separar a porta do destino público. Verifique as configurações Minecraft Bedrock / UDP no playit.gg.",
    "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Amigos na Java Edition devem usar o endereço Java habitual, não estes valores.",
  },
  "zh-CN": {
    "統合版の友達が入力する内容": "基岩版朋友需要输入的内容", "Minecraft統合版では、アドレスとポートを別々に入力します": "Minecraft 基岩版需要分别输入地址和端口", "サーバーアドレス": "服务器地址", "サーバーポート": "服务器端口", "アドレスをコピー": "复制地址", "ポートをコピー": "复制端口", "未取得": "未获取",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "不要在基岩版的服务器端口中保留 Java 版端口 25565。请输入上方显示的基岩版端口。", "「プレイ」を開く": "打开游戏", "「サーバー」→「サーバーを追加」を選ぶ": "选择服务器，然后选择添加服务器", "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "将上方的服务器地址和端口分别输入对应栏位", "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "无法从公开地址中分离端口。请检查 playit.gg 的 Minecraft Bedrock / UDP 设置。", "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Java 版朋友应使用原来的 Java 地址，而不是这里显示的值。",
  },
  "zh-TW": {
    "統合版の友達が入力する内容": "基岩版朋友需要輸入的內容", "Minecraft統合版では、アドレスとポートを別々に入力します": "Minecraft 基岩版需要分別輸入位址和連接埠", "サーバーアドレス": "伺服器位址", "サーバーポート": "伺服器連接埠", "アドレスをコピー": "複製位址", "ポートをコピー": "複製連接埠", "未取得": "尚未取得",
    "統合版の「サーバーポート」にJava版用の 25565 を残さず、上に表示された統合版用ポートを入力してください。": "請勿在基岩版的伺服器連接埠保留 Java 版連接埠 25565。請輸入上方顯示的基岩版連接埠。", "「プレイ」を開く": "開啟遊玩", "「サーバー」→「サーバーを追加」を選ぶ": "選擇伺服器，再選擇新增伺服器", "上のサーバーアドレスとサーバーポートを、それぞれ対応する欄へ入力する": "將上方的伺服器位址與連接埠分別輸入對應欄位", "公開先からポートを分離できませんでした。playit.ggのMinecraft Bedrock / UDP設定を確認してください。": "無法從公開位址分離連接埠。請檢查 playit.gg 的 Minecraft Bedrock / UDP 設定。", "Java版の友達は、ここに表示された値ではなく従来のJava版用アドレスを使います。": "Java 版朋友應使用原本的 Java 位址，而不是這裡顯示的值。",
  },
};

const UI_CORRECTION_PATTERNS: Partial<Record<AppLocale, Record<string, string>>> = {
  en: { "[[VAR0]]人": "[[VAR0]] players", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]] cores / [[VAR1]] threads", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]] cores / [[VAR1]] threads · [[VAR2]]% usage", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "[[VAR0]] players are connected, but their names could not be read from the server response or current session log." },
  de: { "[[VAR0]]人": "[[VAR0]] Spieler", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]] Kerne / [[VAR1]] Threads", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]] Kerne / [[VAR1]] Threads · [[VAR2]] % Auslastung", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "[[VAR0]] Spieler sind verbunden, ihre Namen konnten jedoch nicht aus der Serverantwort oder dem aktuellen Sitzungsprotokoll gelesen werden." },
  es: { "[[VAR0]]人": "[[VAR0]] jugadores", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]] núcleos / [[VAR1]] hilos", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]] núcleos / [[VAR1]] hilos · [[VAR2]] % de uso", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "Hay [[VAR0]] jugadores conectados, pero sus nombres no se pudieron leer de la respuesta del servidor ni del registro de la sesión actual." },
  fr: { "[[VAR0]]人": "[[VAR0]] joueurs", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]] cœurs / [[VAR1]] threads", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]] cœurs / [[VAR1]] threads · utilisation [[VAR2]] %", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "[[VAR0]] joueurs sont connectés, mais leurs noms n’ont pas pu être lus dans la réponse du serveur ou le journal de la session actuelle." },
  ko: { "[[VAR0]]人": "[[VAR0]]명", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]]코어 / [[VAR1]]스레드", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]]코어 / [[VAR1]]스레드 · 사용률 [[VAR2]]%", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "[[VAR0]]명이 접속 중이지만 서버 응답이나 현재 세션 로그에서 이름을 가져오지 못했습니다." },
  "pt-BR": { "[[VAR0]]人": "[[VAR0]] jogadores", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]] núcleos / [[VAR1]] threads", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]] núcleos / [[VAR1]] threads · [[VAR2]]% de uso", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "Há [[VAR0]] jogadores conectados, mas os nomes não puderam ser lidos da resposta do servidor nem do registro da sessão atual." },
  "zh-CN": { "[[VAR0]]人": "[[VAR0]] 人", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]] 核 / [[VAR1]] 线程", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]] 核 / [[VAR1]] 线程 · 使用率 [[VAR2]]%", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "已有 [[VAR0]] 人连接，但无法从服务器响应或当前会话日志中读取姓名。" },
  "zh-TW": { "[[VAR0]]人": "[[VAR0]] 人", "[[VAR0]]コア / [[VAR1]]スレッド": "[[VAR0]] 核心 / [[VAR1]] 執行緒", "[[VAR0]]コア / [[VAR1]]スレッド · 使用率 [[VAR2]]%": "[[VAR0]] 核心 / [[VAR1]] 執行緒 · 使用率 [[VAR2]]%", "参加人数は[[VAR0]]人ですが、サーバー応答と現在セッションのログから名前を取得できませんでした。": "已有 [[VAR0]] 人連線，但無法從伺服器回應或目前工作階段日誌讀取名稱。" },
};

const MEMORY_HELP_PATTERNS: Partial<Record<AppLocale, Record<string, string>>> = {
  en: { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "Java launch settings adapted to this PC (about [[VAR0]] GiB total)" },
  de: { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "An diesen PC angepasste Java-Starteinstellungen (insgesamt etwa [[VAR0]] GiB)" },
  es: { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "Ajustes de inicio de Java adaptados a este PC (unos [[VAR0]] GiB en total)" },
  fr: { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "Réglages de lancement Java adaptés à ce PC (environ [[VAR0]] Gio au total)" },
  ko: { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "이 PC(총 약 [[VAR0]] GiB)에 맞춘 Java 실행 설정" },
  "pt-BR": { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "Configurações de inicialização do Java adaptadas a este PC (cerca de [[VAR0]] GiB no total)" },
  "zh-CN": { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "适合此电脑的 Java 启动设置（总计约 [[VAR0]] GiB）" },
  "zh-TW": { "このPC（合計約[[VAR0]] GiB）に合わせたJava起動設定": "適合此電腦的 Java 啟動設定（總計約 [[VAR0]] GiB）" },
};

type CompiledPattern = { regex: RegExp; translated: string; specificity: number };
type AttributeState = { source: string; rendered: string };

const textSources = new WeakMap<Text, string>();
const textRendered = new WeakMap<Text, string>();
const attributeStates = new WeakMap<Element, Map<string, AttributeState>>();
const patternCache = new Map<AppLocale, { source: TranslationCatalogPatterns; compiled: CompiledPattern[] }>();
const generatedTextCache = new Map<AppLocale, Map<string, string>>();
const GENERATED_TEXT_CACHE_LIMIT = 2_000;
type TranslationCatalogPatterns = Readonly<Record<string, string>>;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePatterns(locale: AppLocale): CompiledPattern[] {
  const generated = getTranslationCatalog(locale);
  const cached = patternCache.get(locale);
  if (cached?.source === generated.patterns) return cached.compiled;
  const sourcePatterns = { ...generated.patterns, ...CURATED_PATTERNS[locale], ...MEMORY_HELP_PATTERNS[locale], ...UI_CORRECTION_PATTERNS[locale] };
  const compiled = Object.entries(sourcePatterns).map(([source, translated]) => {
    let position = 0;
    let expression = "^";
    for (const match of source.matchAll(MARKER)) {
      expression += escapeRegExp(source.slice(position, match.index)) + "(.*?)";
      position = (match.index ?? 0) + match[0].length;
    }
    expression += escapeRegExp(source.slice(position)) + "$";
    return { regex: new RegExp(expression, "s"), translated: UI_CORRECTION_PATTERNS[locale]?.[source] ?? MEMORY_HELP_PATTERNS[locale]?.[source] ?? CURATED_PATTERNS[locale]?.[source] ?? translated, specificity: source.replace(MARKER, "").length };
  }).sort((left, right) => right.specificity - left.specificity);
  patternCache.set(locale, { source: generated.patterns, compiled });
  return compiled;
}

function translateCore(source: string, locale: AppLocale) {
  if (locale === "ja" || !JAPANESE.test(source)) return source;
  const serverLab = SERVER_LAB_EXACT[locale]?.[source];
  if (serverLab !== undefined) return serverLab;
  const curated = CURATED_EXACT[locale]?.[source];
  if (curated !== undefined) return curated;
  const modManagement = MOD_MANAGEMENT_EXACT[locale]?.[source];
  if (modManagement !== undefined) return modManagement;
  const modManagementExtra = MOD_MANAGEMENT_EXTRA_EXACT[locale]?.[source];
  if (modManagementExtra !== undefined) return modManagementExtra;
  const modManagementAction = MOD_MANAGEMENT_ACTIONS_EXACT[locale]?.[source];
  if (modManagementAction !== undefined) return modManagementAction;
  for (const [template, translated] of Object.entries(MOD_MANAGEMENT_PATTERNS[locale] ?? {})) {
    const markerIndex = template.indexOf("[[VAR0]]");
    const prefix = template.slice(0, markerIndex);
    const suffix = template.slice(markerIndex + "[[VAR0]]".length);
    if (markerIndex >= 0 && source.startsWith(prefix) && source.endsWith(suffix) && source.length >= prefix.length + suffix.length) {
      const value = source.slice(prefix.length, source.length - suffix.length || undefined);
      return translated.replace("[[VAR0]]", value);
    }
  }
  for (const [template, translated] of Object.entries(MOD_MANAGEMENT_EXTRA_PATTERNS[locale] ?? {})) {
    const markerIndex = template.indexOf("[[VAR0]]");
    const prefix = template.slice(0, markerIndex);
    const suffix = template.slice(markerIndex + "[[VAR0]]".length);
    if (markerIndex >= 0 && source.startsWith(prefix) && source.endsWith(suffix) && source.length >= prefix.length + suffix.length) {
      const value = source.slice(prefix.length, source.length - suffix.length || undefined);
      return translated.replace("[[VAR0]]", value);
    }
  }
  const memoryHelp = MEMORY_HELP_EXACT[locale]?.[source];
  if (memoryHelp !== undefined) return memoryHelp;
  const playerStatus = PLAYER_STATUS_EXACT[locale]?.[source];
  if (playerStatus !== undefined) return playerStatus;
  const crossplayAccess = CROSSPLAY_ACCESS_EXACT[locale]?.[source];
  if (crossplayAccess !== undefined) return crossplayAccess;
  const fixedMember = FIXED_MEMBER_EXACT[locale]?.[source];
  if (fixedMember !== undefined) return fixedMember;
  const bedrockEndpoint = BEDROCK_ENDPOINT_EXACT[locale]?.[source];
  if (bedrockEndpoint !== undefined) return bedrockEndpoint;
  const catalog = getTranslationCatalog(locale);
  const exact = catalog.exact[source];
  if (exact) return exact;
  for (const pattern of compilePatterns(locale)) {
    const match = pattern.regex.exec(source);
    if (!match) continue;
    let index = 1;
    return pattern.translated.replace(MARKER, () => {
      const captured = match[index++] ?? "";
      const curatedCapture = CURATED_EXACT[locale]?.[captured];
      if (curatedCapture !== undefined) return curatedCapture;
      const crossplayCapture = CROSSPLAY_ACCESS_EXACT[locale]?.[captured];
      if (crossplayCapture !== undefined) return crossplayCapture;
      return catalog.exact[captured] || captured;
    });
  }
  return source;
}

export function translateGeneratedText(source: string, locale: AppLocale) {
  let localeCache = generatedTextCache.get(locale);
  if (!localeCache) {
    localeCache = new Map();
    generatedTextCache.set(locale, localeCache);
  }
  const cached = localeCache.get(source);
  if (cached !== undefined) return cached;
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const core = source.slice(leading.length, source.length - trailing.length || undefined);
  if (!core) return source;
  const direct = translateCore(core, locale);
  let result: string;
  if (direct !== core) result = `${leading}${direct}${trailing}`;
  else {
    const normalized = core.replace(/[ \t\r\f\v]+/g, " ");
    const normalizedTranslation = translateCore(normalized, locale);
    result = normalizedTranslation === normalized ? source : `${leading}${normalizedTranslation}${trailing}`;
  }
  if (localeCache.size >= GENERATED_TEXT_CACHE_LIMIT) {
    const oldest = localeCache.keys().next().value as string | undefined;
    if (oldest !== undefined) localeCache.delete(oldest);
  }
  localeCache.set(source, result);
  return result;
}

function isExcluded(element: Element | null) {
  return Boolean(element?.closest(EXCLUDED_SELECTOR));
}

function translateTextNode(node: Text, locale: AppLocale) {
  if (isExcluded(node.parentElement)) return;
  const current = node.nodeValue ?? "";
  const lastRendered = textRendered.get(node);
  if (!textSources.has(node) || (lastRendered !== undefined && current !== lastRendered)) textSources.set(node, current);
  const source = textSources.get(node) ?? current;
  const translated = translateGeneratedText(source, locale);
  textRendered.set(node, translated);
  if (current !== translated) node.nodeValue = translated;
}

function translateAttribute(element: Element, attribute: string, locale: AppLocale) {
  if (isExcluded(element)) return;
  const current = element.getAttribute(attribute);
  if (current === null) return;
  let states = attributeStates.get(element);
  if (!states) {
    states = new Map();
    attributeStates.set(element, states);
  }
  const previous = states.get(attribute);
  const source = !previous || current !== previous.rendered ? current : previous.source;
  const translated = translateGeneratedText(source, locale);
  states.set(attribute, { source, rendered: translated });
  if (current !== translated) element.setAttribute(attribute, translated);
}

function translateSubtree(root: Node, locale: AppLocale) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, locale);
    return;
  }
  if (!(root instanceof Element) && !(root instanceof DocumentFragment) && !(root instanceof Document)) return;
  if (root instanceof Element) {
    if (isExcluded(root)) return;
    TRANSLATED_ATTRIBUTES.forEach((attribute) => translateAttribute(root, attribute, locale));
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, locale);
    else TRANSLATED_ATTRIBUTES.forEach((attribute) => translateAttribute(node as Element, attribute, locale));
    node = walker.nextNode();
  }
}

export function installDocumentTranslation(locale: AppLocale) {
  const root = document.body;
  if (!root) return () => undefined;
  translateSubtree(root, locale);
  document.documentElement.dataset.documentTranslationLocale = locale;
  // Japanese is the source language. A one-time walk restores text that was
  // previously translated, but no mutation observer is needed afterwards.
  if (locale === "ja") return () => undefined;

  const pendingRoots = new Set<Node>();
  const pendingText = new Set<Text>();
  const pendingAttributes = new Map<Element, Set<string>>();
  let flushTimer: number | undefined;

  const isCoveredByRoot = (node: Node) => {
    for (const pendingRoot of pendingRoots) if (pendingRoot === node || pendingRoot.contains(node)) return true;
    return false;
  };
  const addRoot = (node: Node) => {
    if (isCoveredByRoot(node)) return;
    for (const pendingRoot of [...pendingRoots]) if (node.contains(pendingRoot)) pendingRoots.delete(pendingRoot);
    pendingRoots.add(node);
  };
  const flush = () => {
    flushTimer = undefined;
    const roots = [...pendingRoots];
    const textNodes = [...pendingText];
    const attributes = [...pendingAttributes];
    pendingRoots.clear();
    pendingText.clear();
    pendingAttributes.clear();
    roots.forEach((node) => translateSubtree(node, locale));
    textNodes.forEach((node) => {
      if (!roots.some((pendingRoot) => pendingRoot === node || pendingRoot.contains(node))) translateTextNode(node, locale);
    });
    attributes.forEach(([element, names]) => {
      if (roots.some((pendingRoot) => pendingRoot === element || pendingRoot.contains(element))) return;
      names.forEach((name) => translateAttribute(element, name, locale));
    });
  };
  const scheduleFlush = () => {
    if (flushTimer !== undefined) return;
    // Yield once so React can paint the selected screen before translating its
    // newly mounted subtree. This removes the long click-to-paint task on low-
    // end CPUs while still applying translations immediately afterwards.
    flushTimer = window.setTimeout(flush, 0);
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") pendingText.add(mutation.target as Text);
      else if (mutation.type === "attributes") {
        const element = mutation.target as Element;
        const attribute = mutation.attributeName;
        if (!attribute) continue;
        const names = pendingAttributes.get(element) ?? new Set<string>();
        names.add(attribute);
        pendingAttributes.set(element, names);
      } else mutation.addedNodes.forEach(addRoot);
    }
    scheduleFlush();
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATED_ATTRIBUTES] });
  return () => {
    observer.disconnect();
    if (flushTimer !== undefined) window.clearTimeout(flushTimer);
    pendingRoots.clear();
    pendingText.clear();
    pendingAttributes.clear();
  };
}
