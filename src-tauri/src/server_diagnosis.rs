use std::{
    collections::HashSet,
    fs::File,
    io::Read,
    net::{TcpListener, UdpSocket},
    path::Path,
};

use chrono::Utc;
use regex::Regex;
use sysinfo::{Disks, System};
use zip::ZipArchive;

use crate::{
    java::required_java_major,
    models::{DiagnosisIssue, LogEntry, ServerDiagnosisReport, ServerProfile},
};

pub fn analyze(
    profile: &ServerProfile,
    memory_logs: &[LogEntry],
    check_port: bool,
) -> ServerDiagnosisReport {
    let mut issues = Vec::new();
    let root = Path::new(&profile.root_path);
    let is_bedrock = profile.server_type == "bedrock";

    if !is_bedrock {
        let required_java = required_java_major(&profile.server_type, &profile.minecraft_version);
        if !Path::new(&profile.java_path).is_file() {
            issues.push(issue(
                "java-missing",
                "error",
                "設定されたJavaが見つかりません",
                "サーバーを起動できません。",
                "Javaが移動・削除されたか、登録したパスが無効です。",
                &[
                    "Java環境画面で再検出してください。",
                    "必要なJavaを公式配布元から導入し、サーバーごとに選択してください。",
                ],
                vec![],
                false,
            ));
        } else if profile.java_major < required_java {
            issues.push(issue(
                "java-version",
                "error",
                &format!(
                    "Java {} が必要ですが、Java {} が選択されています",
                    required_java, profile.java_major
                ),
                "起動直後に終了する可能性があります。",
                "Minecraftまたはサーバー種類とJavaの世代が一致していません。",
                &["Java環境画面で互換と表示されるJavaを選択してください。"],
                vec![],
                false,
            ));
        }

        let eula_ok = std::fs::read_to_string(root.join("eula.txt"))
            .ok()
            .is_some_and(|text| {
                text.lines()
                    .any(|line| line.trim().eq_ignore_ascii_case("eula=true"))
            });
        if !eula_ok {
            issues.push(issue(
                "eula",
                "error",
                "Minecraft EULAへの同意を確認できません",
                "サーバーは起動を拒否します。",
                "eula.txtがないか、eula=falseのままです。",
                &["EULAの内容を本人が確認し、同意する場合だけeula=trueに変更してください。"],
                vec![],
                false,
            ));
        }
    }

    if !launch_target_exists(profile) {
        if is_bedrock {
            issues.push(issue(
                "launch-target",
                "error",
                "bedrock_server.exe が見つかりません",
                "統合版サーバーを起動できません。",
                "公式BDSの実行ファイルが削除・移動されたか、取り込み元が不完全です。",
                &[
                    "既存サーバーを再スキャンしてください。",
                    "現在のフォルダーを保全してからMinecraft公式BDSを再取得してください。",
                ],
                vec![],
                true,
            ));
        } else {
            issues.push(issue(
                "launch-target",
                "error",
                "サーバーの起動ファイルが見つかりません",
                "Javaを実行してもサーバーを読み込めません。",
                "JARが削除・改名されたか、Forge系の起動情報が不足しています。",
                &[
                    "ファイルを再配置するか、既存サーバーを再スキャンしてください。",
                    "配布元から対応バージョンを再取得する前にバックアップしてください。",
                ],
                vec![],
                true,
            ));
        }
    }

    let port_available = if is_bedrock {
        udp_port_available(profile.port)
    } else {
        tcp_port_available(profile.port)
    };
    if check_port && !port_available {
        let protocol = if is_bedrock { "UDP" } else { "TCP" };
        issues.push(issue(
            "port-in-use",
            "error",
            &format!("{protocol}ポート {} はすでに使用されています", profile.port),
            "サーバーはアドレスを確保できず起動に失敗します。",
            "別のMinecraftサーバーやアプリが同じポートを使っています。",
            &[
                "別のサーバーが動いていないか確認してください。",
                "設定で未使用のポートへ変更してください。",
            ],
            vec![],
            false,
        ));
    }

    if let Some(incomplete) = incomplete_world_issue(profile) {
        issues.push(incomplete);
    }

    let mut system = System::new_all();
    system.refresh_memory();
    let total_mib = system.total_memory() / 1024 / 1024;
    let available_mib = system.available_memory() / 1024 / 1024;
    if profile.max_memory_mib as u64 + 1024 > total_mib
        || profile.max_memory_mib as u64 > available_mib.saturating_add(512)
    {
        issues.push(issue(
            "memory",
            "warning",
            "設定したメモリを安全に確保できない可能性があります",
            "起動失敗、強制終了、PC全体の動作低下につながります。",
            "最大割り当てが現在の空きメモリまたはPC全体に対して大きすぎます。",
            &["最大メモリを下げるか、他のアプリを終了してください。"],
            vec![],
            false,
        ));
    }

    if let Some(disk) = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .filter(|disk| root.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
    {
        if disk.available_space() < 2 * 1024 * 1024 * 1024 {
            issues.push(issue(
                "disk",
                "warning",
                "サーバー保存先の空き容量が少なくなっています",
                "ワールド保存やバックアップが途中で失敗する可能性があります。",
                "保存先の空き容量が2 GiB未満です。",
                &[
                    "不要ファイルを確認して空きを増やしてください。",
                    "削除前にバックアップ先も確認してください。",
                ],
                vec![],
                true,
            ));
        }
    }

    if profile.server_type == "fabric" {
        issues.extend(fabric_dependency_issues(root));
    }
    issues.extend(extension_compatibility_issues(profile));

    let logs = collect_logs(root, memory_logs);
    issues.extend(classify_logs(&logs));
    deduplicate(&mut issues);
    ServerDiagnosisReport {
        checked_at: Utc::now().to_rfc3339(),
        healthy: !issues.iter().any(|item| item.severity == "error"),
        issues,
        redaction_note: "診断はこのPC内だけで実行しました。IPアドレス、トークン、認証情報らしき文字列は関連ログで伏せ字にしています。".into(),
    }
}

fn tcp_port_available(port: u16) -> bool {
    // On Windows, binding 0.0.0.0 can succeed while another process already
    // owns 127.0.0.1:<port> (and vice versa). Probe the two bind scopes
    // separately, dropping each probe before the next one so they do not
    // conflict with each other.
    let loopback_available = match TcpListener::bind(("127.0.0.1", port)) {
        Ok(listener) => {
            drop(listener);
            true
        }
        Err(_) => false,
    };
    if !loopback_available {
        return false;
    }
    match TcpListener::bind(("0.0.0.0", port)) {
        Ok(listener) => {
            drop(listener);
            true
        }
        Err(_) => false,
    }
}

pub(crate) fn udp_port_available(port: u16) -> bool {
    let loopback_available = match UdpSocket::bind(("127.0.0.1", port)) {
        Ok(socket) => {
            drop(socket);
            true
        }
        Err(_) => false,
    };
    if !loopback_available {
        return false;
    }
    match UdpSocket::bind(("0.0.0.0", port)) {
        Ok(socket) => {
            drop(socket);
            true
        }
        Err(_) => false,
    }
}

fn launch_target_exists(profile: &ServerProfile) -> bool {
    let root = Path::new(&profile.root_path);
    match profile.server_type.as_str() {
        "forge" => profile.distribution_build.as_ref().is_some_and(|build| {
            root.join(format!(
                "libraries/net/minecraftforge/forge/{build}/win_args.txt"
            ))
            .is_file()
        }),
        "neoforge" => profile.distribution_build.as_ref().is_some_and(|build| {
            root.join(format!(
                "libraries/net/neoforged/neoforge/{build}/win_args.txt"
            ))
            .is_file()
        }),
        _ => root.join(&profile.launch_target).is_file(),
    }
}

fn collect_logs(root: &Path, memory_logs: &[LogEntry]) -> Vec<String> {
    let mut result = memory_logs
        .iter()
        .rev()
        .take(300)
        .map(|entry| entry.message.clone())
        .collect::<Vec<_>>();
    for path in [
        Some(root.join("logs/latest.log")),
        newest_crash_report(root),
    ] {
        let Some(path) = path else { continue };
        if let Ok(text) = std::fs::read_to_string(path) {
            result.extend(text.lines().rev().take(400).map(str::to_string));
        }
    }
    result
}

fn newest_crash_report(root: &Path) -> Option<std::path::PathBuf> {
    std::fs::read_dir(root.join("crash-reports"))
        .ok()?
        .flatten()
        .filter(|entry| entry.path().extension().and_then(|v| v.to_str()) == Some("txt"))
        .max_by_key(|entry| entry.metadata().and_then(|meta| meta.modified()).ok())
        .map(|entry| entry.path())
}

fn incomplete_world_issue(profile: &ServerProfile) -> Option<DiagnosisIssue> {
    let root = Path::new(&profile.root_path);
    let world = root.join(&profile.settings.world_name);
    if !world.join("level.dat").is_file() {
        return None;
    }
    let expected_settings =
        world.join("dimensions/minecraft/overworld/data/minecraft/world_gen_settings.dat");
    if expected_settings.is_file() {
        return None;
    }
    let latest_log = std::fs::read_to_string(root.join("logs/latest.log")).ok()?;
    let failure_lines = latest_log
        .lines()
        .filter(|line| {
            line.contains("Overworld settings missing")
                || line.contains("Unable to read or access the world gen settings file")
        })
        .take(5)
        .map(redact)
        .collect::<Vec<_>>();
    if failure_lines.is_empty() {
        return None;
    }
    Some(issue(
        "world-generation-incomplete",
        "error",
        "初回生成が途中で止まった不完全なワールドを検出しました",
        "このままではワールドを読み込めず、サーバーを起動できません。",
        "最初のワールド生成中にポート競合や強制終了が発生し、生成設定ファイルが保存されなかった可能性があります。",
        &[
            "設定の「ワールド再生成」を開いてください。",
            "アプリが現在の状態をバックアップしてからワールドを再生成します。",
            "残したいワールドの場合は、再生成せず検証済みバックアップから復元してください。",
        ],
        failure_lines,
        true,
    ))
}

fn classify_logs(logs: &[String]) -> Vec<DiagnosisIssue> {
    let joined = logs.join("\n");
    let mut issues = client_only_mod_issue(logs);
    issues.extend(iron_spellbooks_loot_table_issue(logs));
    let patterns = [
        (
            "unsupported-class",
            "UnsupportedClassVersionError",
            "Javaのバージョンが合っていません",
            "起動直後にサーバーが終了します。",
            "JARが現在より新しいJavaで作られています。",
            "互換Javaへ切り替えてください。",
            false,
        ),
        (
            "oom",
            "OutOfMemoryError",
            "サーバーのメモリが不足しました",
            "サーバーが停止したり、ワールド保存が遅れる可能性があります。",
            "割り当て不足、Mod過多、またはメモリリークが考えられます。",
            "バックアップ後に割り当てとMod構成を見直してください。",
            true,
        ),
        (
            "bind",
            "Failed to bind to port",
            "ポートを使用できませんでした",
            "サーバーは外部から接続できない状態で終了します。",
            "同じポートを別プロセスが使っています。",
            "別サーバーを停止するか、ポートを変更してください。",
            false,
        ),
        (
            "mod-dependency-log",
            "requires version",
            "Modの依存関係または対応版に問題があります",
            "Modローダーが起動を中止する可能性があります。",
            "必要なModがないか、Minecraft・ローダーのバージョンが一致していません。",
            "関連ログのMod名を確認し、配布元の対応表に合わせてください。",
            true,
        ),
        (
            "missing-class",
            "NoClassDefFoundError",
            "必要なJavaクラスを読み込めませんでした",
            "Mod・プラグインまたはサーバー本体が停止します。",
            "依存ファイル不足または組み合わせの不一致が考えられます。",
            "直前に追加した拡張機能を確認し、バックアップから戻すことを検討してください。",
            true,
        ),
        (
            "permission",
            "AccessDeniedException",
            "ファイルへのアクセスが拒否されました",
            "設定・ワールド・ログを書き込めない可能性があります。",
            "権限不足、同期ソフト、ウイルス対策、または他プロセスのロックが考えられます。",
            "サーバーを停止し、対象ファイルを使用中のアプリとフォルダー権限を確認してください。",
            false,
        ),
        (
            "world-load",
            "Failed to load level",
            "ワールドを読み込めませんでした",
            "サーバーが起動できないか、別ワールドで起動する危険があります。",
            "ワールドデータの破損または非互換が考えられます。",
            "現在のフォルダーを保全し、検証済みバックアップからの復元を検討してください。",
            true,
        ),
        (
            "main-class",
            "Could not find or load main class",
            "サーバーの起動クラスが見つかりません",
            "起動処理を開始できません。",
            "起動引数またはローダーのインストールが不完全です。",
            "起動ファイルを再スキャンし、対応ローダーを正しく導入してください。",
            true,
        ),
    ];
    issues.extend(patterns.into_iter().filter_map(
        |(id, needle, what, impact, cause, action, restore)| {
            if !joined.contains(needle) {
                return None;
            }
            let related = logs
                .iter()
                .filter(|line| line.contains(needle))
                .take(5)
                .map(|line| redact(line))
                .collect();
            Some(issue(
                id,
                "error",
                what,
                impact,
                cause,
                &[action],
                related,
                restore,
            ))
        },
    ));
    issues
}

/// Iron's Spells 'n Spellbooks 1.20.1-3.16.3 is known to log two non-fatal
/// loot-table parse warnings on Minecraft 1.20.1: one table is missing the
/// required `name` field and another uses the newer
/// `minecraft:set_written_book_pages` function.  Surface the pair as one
/// compatibility warning so users get safe update guidance instead of being
/// encouraged to edit a third-party JAR in place.
fn iron_spellbooks_loot_table_issue(logs: &[String]) -> Vec<DiagnosisIssue> {
    let related = logs
        .iter()
        .filter(|line| {
            let lower = line.to_ascii_lowercase();
            lower.contains("irons_spellbooks")
                && ((lower.contains("missing name") && lower.contains("catacombs/crypt_loot"))
                    || (lower.contains("minecraft:set_written_book_pages")
                        && lower.contains("citadel/citadel_tomes")))
        })
        .take(5)
        .map(|line| redact(line))
        .collect::<Vec<_>>();
    if related.is_empty() {
        return Vec::new();
    }
    vec![issue(
        "iron-spells-loot-table-compatibility",
        "warning",
        "Iron's Spells 'n SpellbooksのLoot Table互換性警告を検出しました",
        "catacombs/crypt_lootまたはcitadel/citadel_tomesの報酬テーブルが読み込まれず、該当ダンジョンの報酬や書籍ページ生成に影響する可能性があります。サーバー全体の起動失敗とは限りません。",
        "irons_spellbooks 1.20.1-3.16.3のデータ形式が、実行中のMinecraft 1.20.1のLoot Table仕様と一致していません（name不足／minecraft:set_written_book_pages未対応）。",
        &[
            "Iron's Spells 'n Spellbooksの配布元でMinecraft 1.20.1・Forge向けの対応版とCitadel依存版を確認し、更新前にサーバーをバックアップしてください。",
            "JAR内のLoot Tableを直接書き換えず、同じMinecraft／Forge向けの公式修正版へ置き換えてください。",
            "更新後にサーバー診断を再実行し、関連ログから同じ警告が消えたか確認してください。",
        ],
        related,
        false,
    )]
}

/// Forge can load a mod's common entrypoint before it has a chance to route
/// client-only setup through a dist guard.  On a dedicated server this is
/// reported as `invalid dist DEDICATED_SERVER`, followed by the mod id whose
/// constructor failed.  Keep this separate from the generic class-loading
/// rules so the user gets an actionable "move this mod to the client" message.
fn client_only_mod_issue(logs: &[String]) -> Vec<DiagnosisIssue> {
    static MOD_ID: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(r"(?i)Failed to create mod instance\.\s*ModID:\s*([A-Za-z0-9_.-]+)").unwrap()
    });
    static INVALID_DIST: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(
            r"(?i)Attempted to load class\s+([A-Za-z0-9_.$/]+)\s+for invalid dist\s+DEDICATED_SERVER",
        )
        .unwrap()
    });

    let Some(dist_line) = logs
        .iter()
        .find(|line| INVALID_DIST.is_match(line.as_str()))
    else {
        return Vec::new();
    };
    let mod_id = logs.iter().find_map(|line| {
        MOD_ID
            .captures(line)
            .and_then(|capture| capture.get(1).map(|value| value.as_str().to_string()))
    });
    let class_name = INVALID_DIST
        .captures(dist_line)
        .and_then(|capture| capture.get(1).map(|value| value.as_str().to_string()))
        .unwrap_or_else(|| "net/minecraft/client/*".into());
    let subject = mod_id
        .as_deref()
        .map(|value| format!("Mod「{value}」"))
        .unwrap_or_else(|| "クライアント専用Mod".into());
    let mut related = Vec::new();
    for line in logs
        .iter()
        .filter(|line| INVALID_DIST.is_match(line.as_str()) || MOD_ID.is_match(line.as_str()))
    {
        let redacted = redact(line);
        if !related.iter().any(|value| value == &redacted) {
            related.push(redacted);
        }
    }
    vec![issue(
        "client-only-mod",
        "error",
        &format!("専用サーバーでクライアント専用Modを読み込もうとしました: {subject}"),
        "Forgeがクライアント用クラスを専用サーバーから除外して安全に終了しました。",
        &format!("{subject}の読み込み中にクライアント専用クラス {class_name} が要求されました。"),
        &[
            "このModをサーバーのmodsフォルダーから外し、必要なら参加者側のクライアントにだけ導入してください。",
            "同じModパックを使う場合は、専用サーバー対応版またはサーバー不要版の有無を配布元で確認してください。",
        ],
        related,
        false,
    )]
}

fn fabric_dependency_issues(root: &Path) -> Vec<DiagnosisIssue> {
    let mut installed = HashSet::from([
        "minecraft".to_string(),
        "java".to_string(),
        "fabricloader".to_string(),
    ]);
    let mut required = Vec::new();
    let Ok(entries) = std::fs::read_dir(root.join("mods")) else {
        return Vec::new();
    };
    for entry in entries
        .flatten()
        .filter(|entry| entry.path().extension().and_then(|v| v.to_str()) == Some("jar"))
    {
        let Ok(mut archive) = File::open(entry.path())
            .and_then(|file| ZipArchive::new(file).map_err(std::io::Error::other))
        else {
            continue;
        };
        let Ok(mut metadata) = archive.by_name("fabric.mod.json") else {
            continue;
        };
        let mut text = String::new();
        if metadata.read_to_string(&mut text).is_err() {
            continue;
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        if let Some(id) = json.get("id").and_then(|value| value.as_str()) {
            installed.insert(id.to_string());
        }
        if let Some(deps) = json.get("depends").and_then(|value| value.as_object()) {
            required.extend(
                deps.keys()
                    .filter(|id| !matches!(id.as_str(), "minecraft" | "java" | "fabricloader"))
                    .cloned(),
            );
        }
    }
    required.sort();
    required.dedup();
    let missing = required
        .into_iter()
        .filter(|id| !installed.contains(id))
        .collect::<Vec<_>>();
    if missing.is_empty() {
        Vec::new()
    } else {
        vec![issue(
            "fabric-dependencies",
            "warning",
            &format!(
                "Fabric Modの依存候補が不足しています: {}",
                missing.join(", ")
            ),
            "次回起動時にModローダーが停止する可能性があります。",
            "fabric.mod.jsonに必須指定されたModがmodsフォルダーで見つかりません。",
            &["各Modの配布元で正しいMinecraft・Fabric Loader向け依存Modを確認してください。"],
            vec![],
            true,
        )]
    }
}

fn extension_compatibility_issues(profile: &ServerProfile) -> Vec<DiagnosisIssue> {
    let root = Path::new(&profile.root_path);
    let mut issues = Vec::new();
    let mut mismatched = Vec::new();
    if let Ok(entries) = std::fs::read_dir(root.join("mods")) {
        for entry in entries
            .flatten()
            .filter(|entry| entry.path().extension().and_then(|v| v.to_str()) == Some("jar"))
        {
            let Ok(file) = File::open(entry.path()) else {
                continue;
            };
            let Ok(archive) = ZipArchive::new(file) else {
                continue;
            };
            let has_fabric = archive.file_names().any(|name| name == "fabric.mod.json");
            let has_forge = archive
                .file_names()
                .any(|name| name == "META-INF/mods.toml");
            let has_neoforge = archive
                .file_names()
                .any(|name| name == "META-INF/neoforge.mods.toml");
            let has_known_loader = has_fabric || has_forge || has_neoforge;
            let matches_server_loader = match profile.server_type.to_ascii_lowercase().as_str() {
                "fabric" => has_fabric,
                "forge" => has_forge,
                "neoforge" => has_neoforge,
                _ => false,
            };
            if has_known_loader && !matches_server_loader {
                mismatched.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }
    if !mismatched.is_empty() {
        issues.push(issue(
            "loader-mismatch",
            "error",
            &format!(
                "別のModローダー向けと思われるModがあります: {}",
                mismatched.join(", ")
            ),
            "ローダーがModを拒否し、起動できない可能性があります。",
            "Fabric／Forge／NeoForgeのいずれかが現在のサーバー種類と一致していません。",
            &["各Modの配布元で、このサーバーのローダー向けファイルを取得してください。"],
            vec![],
            true,
        ));
    }
    if profile.server_type == "paper" {
        let server_line = release_numbers(&profile.minecraft_version);
        let mut too_new = Vec::new();
        if let Ok(entries) = std::fs::read_dir(root.join("plugins")) {
            for entry in entries
                .flatten()
                .filter(|entry| entry.path().extension().and_then(|v| v.to_str()) == Some("jar"))
            {
                let Ok(file) = File::open(entry.path()) else {
                    continue;
                };
                let Ok(mut archive) = ZipArchive::new(file) else {
                    continue;
                };
                let metadata_name = archive
                    .file_names()
                    .find(|name| matches!(*name, "paper-plugin.yml" | "plugin.yml"))
                    .map(str::to_string);
                let Some(metadata_name) = metadata_name else {
                    continue;
                };
                let mut text = String::new();
                let Ok(mut metadata) = archive.by_name(&metadata_name) else {
                    continue;
                };
                if metadata.read_to_string(&mut text).is_err() {
                    continue;
                }
                let api = text.lines().find_map(|line| {
                    line.trim()
                        .strip_prefix("api-version:")
                        .map(|value| value.trim().trim_matches(['\'', '\"']).to_string())
                });
                if api
                    .as_ref()
                    .is_some_and(|value| release_numbers(value) > server_line)
                {
                    too_new.push(entry.file_name().to_string_lossy().to_string());
                }
            }
        }
        if !too_new.is_empty() {
            issues.push(issue(
                "plugin-api-version",
                "warning",
                &format!(
                    "現在より新しいAPI向けの可能性があるプラグイン: {}",
                    too_new.join(", ")
                ),
                "プラグインが無効化または起動失敗する可能性があります。",
                "plugin.ymlのapi-versionがサーバーのMinecraft版より新しく指定されています。",
                &["対応する古い版のプラグインを配布元で確認してください。"],
                vec![],
                true,
            ));
        }
    }
    issues
}

fn release_numbers(value: &str) -> (u32, u32) {
    let mut parts = value.split('.').filter_map(|part| part.parse().ok());
    (parts.next().unwrap_or(0), parts.next().unwrap_or(0))
}

fn redact(text: &str) -> String {
    let ipv4 = Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").unwrap();
    let secret =
        Regex::new(r"(?i)(token|secret|password|authorization|api[_-]?key)(\s*[:=]\s*)\S+")
            .unwrap();
    let text = ipv4.replace_all(text, "[IP_REDACTED]");
    secret.replace_all(&text, "$1$2[REDACTED]").into_owned()
}

fn deduplicate(issues: &mut Vec<DiagnosisIssue>) {
    let mut seen = HashSet::new();
    issues.retain(|item| seen.insert(item.id.clone()));
}

fn issue(
    id: &str,
    severity: &str,
    what: &str,
    impact: &str,
    cause: &str,
    actions: &[&str],
    related_logs: Vec<String>,
    suggest_restore: bool,
) -> DiagnosisIssue {
    DiagnosisIssue {
        id: id.into(),
        severity: severity.into(),
        what_happened: what.into(),
        impact: impact.into(),
        likely_cause: cause.into(),
        next_actions: actions.iter().map(|value| (*value).into()).collect(),
        related_logs,
        suggest_restore,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        analyze, classify_logs, extension_compatibility_issues, redact, tcp_port_available,
        udp_port_available,
    };
    use crate::models::{BasicSettings, ServerProfile};
    use std::{fs, io::Write, path::Path};

    fn profile_for_loader(root: &Path, loader: &str) -> ServerProfile {
        ServerProfile {
            id: format!("diagnosis-{loader}"),
            name: "Diagnosis test".into(),
            root_path: root.display().to_string(),
            game_kind: "minecraft".into(),
            server_type: loader.into(),
            minecraft_version: "1.21.1".into(),
            distribution_build: None,
            launch_target: "server.jar".into(),
            java_path: "java.exe".into(),
            java_major: 21,
            min_memory_mib: 1024,
            max_memory_mib: 4096,
            port: 25565,
            eula_accepted_at: "test".into(),
            pending_restart: false,
            settings: BasicSettings::default(),
            palworld_settings: None,
            created_at: "test".into(),
            updated_at: "test".into(),
        }
    }

    fn write_test_mod(root: &Path, descriptors: &[&str]) {
        use zip::{ZipWriter, write::SimpleFileOptions};

        fs::create_dir_all(root.join("mods")).unwrap();
        let file = fs::File::create(root.join("mods/test-mod.jar")).unwrap();
        let mut archive = ZipWriter::new(file);
        for descriptor in descriptors {
            archive
                .start_file(*descriptor, SimpleFileOptions::default())
                .unwrap();
            archive.write_all(b"test metadata").unwrap();
        }
        archive.finish().unwrap();
    }

    fn temp_mod_root(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "msh-diagnosis-loader-{label}-{}",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn loader_compatibility_uses_matching_descriptors_instead_of_descriptor_order() {
        let descriptors = [
            ("fabric", "fabric.mod.json"),
            ("forge", "META-INF/mods.toml"),
            ("neoforge", "META-INF/neoforge.mods.toml"),
        ];

        for (loader, descriptor) in descriptors {
            let root = temp_mod_root(loader);
            write_test_mod(&root, &[descriptor]);
            let profile = profile_for_loader(&root, loader);
            let issues = extension_compatibility_issues(&profile);
            assert!(
                issues.iter().all(|issue| issue.id != "loader-mismatch"),
                "matching {loader} descriptor should be accepted"
            );
            fs::remove_dir_all(root).unwrap();
        }

        let all_descriptors = [
            "fabric.mod.json",
            "META-INF/mods.toml",
            "META-INF/neoforge.mods.toml",
        ];
        for (loader, _) in descriptors {
            let root = temp_mod_root(&format!("multi-{loader}"));
            write_test_mod(&root, &all_descriptors);
            let profile = profile_for_loader(&root, loader);
            let issues = extension_compatibility_issues(&profile);
            assert!(
                issues.iter().all(|issue| issue.id != "loader-mismatch"),
                "multi-loader jar should match its available {loader} descriptor"
            );
            fs::remove_dir_all(root).unwrap();
        }

        for (loader, other_descriptor) in [
            ("fabric", "META-INF/mods.toml"),
            ("forge", "fabric.mod.json"),
            ("neoforge", "META-INF/mods.toml"),
        ] {
            let root = temp_mod_root(&format!("wrong-{loader}"));
            write_test_mod(&root, &[other_descriptor]);
            let profile = profile_for_loader(&root, loader);
            let issues = extension_compatibility_issues(&profile);
            assert!(
                issues.iter().any(|issue| issue.id == "loader-mismatch"),
                "a {other_descriptor} only jar should not match {loader}"
            );
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn classifies_common_crash_causes() {
        let logs = vec![
            "java.lang.OutOfMemoryError: Java heap space".into(),
            "Failed to bind to port 25565".into(),
            "Mod abc requires version xyz".into(),
        ];
        let issues = classify_logs(&logs);
        assert!(issues.iter().any(|issue| issue.id == "oom"));
        assert!(issues.iter().any(|issue| issue.id == "bind"));
        assert!(issues.iter().any(|issue| issue.id == "mod-dependency-log"));
    }

    #[test]
    fn classifies_iron_spellbooks_loot_table_warnings_as_non_fatal_compatibility_issue() {
        let logs = vec![
            "[Server thread/WARN] [minecraft/LootDataManager]: Couldn't parse loot table irons_spellbooks:catacombs/crypt_loot: Missing name".into(),
            "[Server thread/WARN] [minecraft/LootDataManager]: Couldn't parse loot table irons_spellbooks:citadel/citadel_tomes: Unknown type minecraft:set_written_book_pages".into(),
        ];
        let issues = classify_logs(&logs);
        let issue = issues
            .iter()
            .find(|value| value.id == "iron-spells-loot-table-compatibility")
            .expect("Iron's Spells loot table warning should be diagnosed");
        assert_eq!(issue.severity, "warning");
        assert!(issue.what_happened.contains("Loot Table互換性警告"));
        assert!(issue.likely_cause.contains("name不足"));
        assert!(
            issue
                .next_actions
                .iter()
                .any(|action| action.contains("直接書き換えず"))
        );
        assert_eq!(issue.related_logs.len(), 2);
    }

    #[test]
    fn classifies_forge_client_only_mod_failure_with_mod_id() {
        let logs = vec![
            "[modloading-worker-0/ERROR] [ne.mi.fm.lo.RuntimeDistCleaner/DISTXFORM]: Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER".into(),
            "[modloading-worker-0/ERROR] [ne.mi.fm.ja.FMLModContainer/LOADING]: Failed to create mod instance. ModID: rpghud, class net.spellcraftgaming.rpghud.main.ModRPGHud".into(),
        ];
        let issues = classify_logs(&logs);
        let issue = issues
            .iter()
            .find(|value| value.id == "client-only-mod")
            .expect("client-only Forge mod should be identified");
        assert!(issue.what_happened.contains("rpghud"));
        assert!(
            issue
                .likely_cause
                .contains("net/minecraft/client/gui/screens/Screen")
        );
        assert!(
            issue
                .next_actions
                .iter()
                .any(|action| action.contains("modsフォルダーから外し"))
        );
        assert!(
            issue
                .related_logs
                .iter()
                .any(|line| line.contains("rpghud"))
        );
    }

    #[test]
    fn redacts_network_and_secret_values() {
        let value = redact("client 192.168.1.12 token=super-secret password: hello");
        assert!(!value.contains("192.168.1.12"));
        assert!(!value.contains("super-secret"));
        assert!(!value.contains("hello"));
    }

    #[test]
    fn detects_missing_and_incompatible_java_and_busy_port() {
        let base =
            std::env::temp_dir().join(format!("msh-diagnosis-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("server.jar"), b"jar").unwrap();
        std::fs::write(base.join("eula.txt"), b"eula=true").unwrap();
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut profile = ServerProfile {
            id: "server".into(),
            name: "Server".into(),
            root_path: base.display().to_string(),
            game_kind: "minecraft".into(),
            server_type: "vanilla".into(),
            minecraft_version: "1.21.1".into(),
            distribution_build: None,
            launch_target: "server.jar".into(),
            java_path: std::env::current_exe().unwrap().display().to_string(),
            java_major: 8,
            min_memory_mib: 1024,
            max_memory_mib: 2048,
            port,
            eula_accepted_at: "test".into(),
            pending_restart: false,
            settings: BasicSettings::default(),
            palworld_settings: None,
            created_at: "test".into(),
            updated_at: "test".into(),
        };
        let report = analyze(&profile, &[], true);
        assert!(report.issues.iter().any(|issue| issue.id == "java-version"));
        assert!(report.issues.iter().any(|issue| issue.id == "port-in-use"));
        profile.java_path = base.join("missing-java.exe").display().to_string();
        let report = analyze(&profile, &[], false);
        assert!(report.issues.iter().any(|issue| issue.id == "java-missing"));
        drop(listener);
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn checks_loopback_and_wildcard_bind_scopes_for_tcp_and_udp() {
        let tcp_loopback = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        assert!(!tcp_port_available(
            tcp_loopback.local_addr().unwrap().port()
        ));
        drop(tcp_loopback);

        let tcp_wildcard = std::net::TcpListener::bind(("0.0.0.0", 0)).unwrap();
        assert!(!tcp_port_available(
            tcp_wildcard.local_addr().unwrap().port()
        ));
        drop(tcp_wildcard);

        let udp_loopback = std::net::UdpSocket::bind(("127.0.0.1", 0)).unwrap();
        assert!(!udp_port_available(
            udp_loopback.local_addr().unwrap().port()
        ));
        drop(udp_loopback);

        let udp_wildcard = std::net::UdpSocket::bind(("0.0.0.0", 0)).unwrap();
        assert!(!udp_port_available(
            udp_wildcard.local_addr().unwrap().port()
        ));
    }

    #[test]
    fn bedrock_skips_java_and_eula_and_checks_udp_port() {
        let base = std::env::temp_dir().join(format!(
            "msh-bedrock-diagnosis-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("bedrock_server.exe"), b"native").unwrap();
        let socket = std::net::UdpSocket::bind(("0.0.0.0", 0)).unwrap();
        let port = socket.local_addr().unwrap().port();
        let profile = ServerProfile {
            id: "bedrock".into(),
            name: "Bedrock".into(),
            root_path: base.display().to_string(),
            game_kind: "minecraft".into(),
            server_type: "bedrock".into(),
            minecraft_version: "1.21.100.7".into(),
            distribution_build: None,
            launch_target: "bedrock_server.exe".into(),
            java_path: String::new(),
            java_major: 0,
            min_memory_mib: 0,
            max_memory_mib: 0,
            port,
            eula_accepted_at: "accepted-in-app".into(),
            pending_restart: false,
            settings: BasicSettings::default(),
            palworld_settings: None,
            created_at: "test".into(),
            updated_at: "test".into(),
        };
        let report = analyze(&profile, &[], true);
        assert!(
            report
                .issues
                .iter()
                .all(|item| !matches!(item.id.as_str(), "java-missing" | "java-version" | "eula"))
        );
        assert!(report.issues.iter().any(|item| item.id == "port-in-use"));
        drop(socket);
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn detects_an_incomplete_first_world_generation() {
        let base =
            std::env::temp_dir().join(format!("msh-incomplete-world-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(base.join("world")).unwrap();
        std::fs::create_dir_all(base.join("logs")).unwrap();
        std::fs::write(base.join("world/level.dat"), b"partial").unwrap();
        std::fs::write(base.join("server.jar"), b"jar").unwrap();
        std::fs::write(base.join("eula.txt"), b"eula=true").unwrap();
        std::fs::write(base.join("logs/latest.log"), "Unable to read or access the world gen settings file!\nCaused by: Overworld settings missing\n").unwrap();
        let profile = ServerProfile {
            id: "server".into(),
            name: "Server".into(),
            root_path: base.display().to_string(),
            game_kind: "minecraft".into(),
            server_type: "paper".into(),
            minecraft_version: "26.2".into(),
            distribution_build: None,
            launch_target: "server.jar".into(),
            java_path: std::env::current_exe().unwrap().display().to_string(),
            java_major: 25,
            min_memory_mib: 1024,
            max_memory_mib: 2048,
            port: 25565,
            eula_accepted_at: "test".into(),
            pending_restart: false,
            settings: BasicSettings::default(),
            palworld_settings: None,
            created_at: "test".into(),
            updated_at: "test".into(),
        };
        let report = analyze(&profile, &[], false);
        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.id == "world-generation-incomplete")
        );
        std::fs::remove_dir_all(base).unwrap();
    }
}
