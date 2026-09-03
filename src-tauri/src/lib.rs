use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use std::sync::{Mutex, Arc};
use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use rand::RngExt;
use rand::distr::Alphanumeric;
use serde_json::Value;

struct NodeProcess(Mutex<Option<(CommandChild, Arc<tokio::sync::Notify>)>>);

#[derive(Serialize, Deserialize, Clone)]
struct RpcCreds {
    user: String,
    pass: String,
    #[serde(default = "default_wallet_name")]
    active_wallet: String,
}
fn default_wallet_name() -> String {
    "main".to_string()
}
fn save_creds(app: &tauri::AppHandle, creds: &RpcCreds) -> Result<(), String> {
    use tauri::Manager;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let creds_path = config_dir.join("rpc_creds.json");
    let data = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    fs::write(&creds_path, data).map_err(|e| e.to_string())
}
fn is_valid_wallet_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn get_datadir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let datadir = config_dir.join("nodedata");
    fs::create_dir_all(&datadir).map_err(|e| e.to_string())?;
    Ok(datadir)
}

fn get_or_create_creds(app: &tauri::AppHandle) -> Result<RpcCreds, String> {
    use tauri::Manager;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let creds_path = config_dir.join("rpc_creds.json");

    if creds_path.exists() {
        let data = fs::read_to_string(&creds_path).map_err(|e| e.to_string())?;
        let creds: RpcCreds = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        return Ok(creds);
    }

    let mut rng = rand::rng();
    let pass: String = (0..32).map(|_| rng.sample(Alphanumeric) as char).collect();
    let creds = RpcCreds { user: "civicnetwallet".to_string(), pass, active_wallet: default_wallet_name() };
    let data = serde_json::to_string(&creds).map_err(|e| e.to_string())?;
    fs::write(&creds_path, data).map_err(|e| e.to_string())?;
    Ok(creds)
}

fn write_node_conf(app: &tauri::AppHandle, creds: &RpcCreds) -> Result<PathBuf, String> {
    use tauri::Manager;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let conf_path = config_dir.join("civicnet.conf");
    // TEMP DEV: split network-specific settings (addnode, rpcbind) into
    // [main]/[regtest] sections so the conf works whether -regtest is passed
    // (current dev setup) or not (real mainnet release) -- v3.0.6 rejects
    // addnode/rpcbind outside the active network's section.
    let contents = format!(
        "server=1\nrpcuser={}\nrpcpassword={}\nrpcallowip=127.0.0.1\nlisten=1\ntxindex=1\n\n[main]\nrpcbind=127.0.0.1\naddnode=45.79.236.253\naddnode=45.118.133.104\naddnode=103.180.165.99\n\n[regtest]\nrpcbind=127.0.0.1\n",
        creds.user, creds.pass
    );
    fs::write(&conf_path, contents).map_err(|e| e.to_string())?;
    Ok(conf_path)
}

async fn rpc_call(creds: &RpcCreds, method: &str, params: Value) -> Result<Value, String> {
    rpc_call_url(creds, "http://127.0.0.1:9332".to_string(), method, params).await
}
// Wallet-scoped calls (balance, send, sign, lock/unlock, per-wallet token
// data, etc.) must hit /wallet/<name> to operate on a specific loaded
// wallet file. Node-level calls (createwallet, listwallets, loadwallet,
// getblockcount, stop, raw-tx builders/broadcast, token registry reads)
// must NOT be wallet-scoped -- hitting /wallet/<name> for a wallet that
// doesn't exist yet (e.g. during first-run bootstrap) fails outright.
async fn rpc_call_wallet(creds: &RpcCreds, method: &str, params: Value) -> Result<Value, String> {
    rpc_call_url(creds, format!("http://127.0.0.1:9332/wallet/{}", creds.active_wallet), method, params).await
}
async fn rpc_call_url(creds: &RpcCreds, url: String, method: &str, params: Value) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "1.0",
        "id": "civicnet-wallet",
        "method": method,
        "params": params
    });
    let res = client
        .post(url)
        .basic_auth(&creds.user, Some(&creds.pass))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    if !json["error"].is_null() {
        return Err(format!("RPC error: {}", json["error"]));
    }
    json.get("result").cloned().ok_or_else(|| "no result field".to_string())
}

#[derive(Serialize)]
struct NodeStatus {
    height: i64,
    peers: i64,
    synced: bool,
}

#[tauri::command]
fn start_node(app: tauri::AppHandle, state: tauri::State<NodeProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("Node is already running".into());
    }
    let creds = get_or_create_creds(&app)?;
    let conf_path = write_node_conf(&app, &creds)?;
    let datadir = get_datadir(&app)?;
    let sidecar = app.shell().sidecar("civicnet-node").map_err(|e| e.to_string())?;
    let conf_arg = format!("-conf={}", conf_path.to_string_lossy());
    let datadir_arg = format!("-datadir={}", datadir.to_string_lossy());
    let (mut rx, child) = sidecar
        .args([conf_arg.as_str(), datadir_arg.as_str(), "-txindex"])
        .spawn()
        .map_err(|e| e.to_string())?;
    let terminated = Arc::new(tokio::sync::Notify::new());
    let terminated_bg = terminated.clone();
    tauri::async_runtime::spawn(async move {
        // Must keep pulling from this channel for the sidecar's entire
        // lifetime -- tauri-plugin-shell buffers every stdout/stderr line
        // the node prints, and if nothing drains it, the buffer fills and
        // the node itself blocks trying to write more output, hanging with
        // 0% CPU/disk (looks identical to a deadlock from the outside).
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(_) = event {
                terminated_bg.notify_waiters();
                break;
            }
        }
    });
    *guard = Some((child, terminated));
    Ok("Node started".into())
}

async fn graceful_shutdown(app: &tauri::AppHandle, state: &tauri::State<'_, NodeProcess>) {
    let pair = {
        let mut guard = match state.0.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        guard.take()
    };
    let (child, terminated) = match pair {
        Some(p) => p,
        None => return,
    };
    if let Ok(creds) = get_or_create_creds(app) {
        if rpc_call(&creds, "stop", serde_json::json!([])).await.is_ok() {
            // Wait for the real process-terminated event (up to 15s, signaled
            // by the background drain task in start_node) so we know
            // chainstate was actually flushed before giving up and
            // force-killing -- no fixed guess-and-hope delay.
            let _ = tokio::time::timeout(std::time::Duration::from_secs(15), terminated.notified()).await;
        }
    }
    let _ = child.kill();
}

#[tauri::command]
async fn stop_node(app: tauri::AppHandle, state: tauri::State<'_, NodeProcess>) -> Result<String, String> {
    graceful_shutdown(&app, &state).await;
    Ok("Node stopped".into())
}

#[tauri::command]
async fn exit_app(app: tauri::AppHandle, state: tauri::State<'_, NodeProcess>) -> Result<(), String> {
    graceful_shutdown(&app, &state).await;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn is_node_running(state: tauri::State<NodeProcess>) -> bool {
    state.0.lock().map(|g| g.is_some()).unwrap_or(false)
}

#[tauri::command]
async fn get_node_status(app: tauri::AppHandle) -> Result<NodeStatus, String> {
    let creds = get_or_create_creds(&app)?;
    let height = rpc_call(&creds, "getblockcount", serde_json::json!([])).await?.as_i64().unwrap_or(0);
    let peers = rpc_call(&creds, "getconnectioncount", serde_json::json!([])).await?.as_i64().unwrap_or(0);
    let blockchain_info = rpc_call(&creds, "getblockchaininfo", serde_json::json!([])).await?;
    let synced = !blockchain_info
        .get("initialblockdownload")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    Ok(NodeStatus { height, peers, synced })
}

#[tauri::command]
async fn wallet_get_balance(app: tauri::AppHandle) -> Result<f64, String> {
    let creds = get_or_create_creds(&app)?;
    let result = rpc_call_wallet(&creds, "getbalance", serde_json::json!([])).await?;
    Ok(result.as_f64().unwrap_or(0.0))
}

#[tauri::command]
async fn wallet_get_new_address(app: tauri::AppHandle) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let result = rpc_call_wallet(&creds, "getnewaddress", serde_json::json!([])).await?;
    Ok(result.as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn wallet_list_transactions(app: tauri::AppHandle, count: i64) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "listtransactions", serde_json::json!(["*", count])).await
}

#[tauri::command]
async fn wallet_send_to_address(app: tauri::AppHandle, address: String, amount: f64) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let result = rpc_call_wallet(&creds, "sendtoaddress", serde_json::json!([address, amount])).await?;
    Ok(result.as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn wallet_create_wallet(app: tauri::AppHandle) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    // Use whichever wallet name is actually recorded as active (defaults to
    // "main" for a first-ever launch, but a returning user may have switched
    // to a different named wallet -- hardcoding "main" here caused the app
    // to try loading the wrong wallet on every subsequent launch, leaving it
    // stuck on the syncing screen even though the node itself was healthy).
    let name = creds.active_wallet.clone();
    match rpc_call(&creds, "loadwallet", serde_json::json!([name])).await {
        Ok(v) => Ok(v),
        Err(e) => {
            let el = e.to_lowercase();
            if el.contains("already loaded") {
                Ok(Value::Null)
            } else if el.contains("not found") || el.contains("path does not exist") {
                rpc_call(&creds, "createwallet", serde_json::json!([name])).await
            } else {
                Err(e)
            }
        }
    }
}

#[tauri::command]
async fn wallet_list_all(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let creds = get_or_create_creds(&app)?;
    let result = rpc_call(&creds, "listwallets", serde_json::json!([])).await?;
    let mut names: Vec<String> = result
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    names.sort();
    Ok(names)
}

#[tauri::command]
async fn wallet_create_named(app: tauri::AppHandle, name: String) -> Result<(), String> {
    if !is_valid_wallet_name(&name) {
        return Err("Wallet name must be 1-64 characters: letters, numbers, - or _ only".to_string());
    }
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "createwallet", serde_json::json!([name])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_switch(app: tauri::AppHandle, name: String) -> Result<(), String> {
    if !is_valid_wallet_name(&name) {
        return Err("Invalid wallet name".to_string());
    }
    let mut creds = get_or_create_creds(&app)?;
    if let Err(e) = rpc_call(&creds, "loadwallet", serde_json::json!([name])).await {
        if !e.to_lowercase().contains("already loaded") {
            return Err(e);
        }
    }
    creds.active_wallet = name;
    save_creds(&app, &creds)?;
    Ok(())
}

#[tauri::command]
async fn wallet_get_active(app: tauri::AppHandle) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    Ok(creds.active_wallet)
}
#[tauri::command]
async fn wallet_import_walletdat(app: tauri::AppHandle, source_path: String, wallet_name: String) -> Result<(), String> {
    if !is_valid_wallet_name(&wallet_name) {
        return Err("Wallet name must be 1-64 characters: letters, numbers, - or _ only".to_string());
    }
    let datadir = get_datadir(&app)?;
    let wallet_dir = datadir.join(&wallet_name);
    fs::create_dir_all(&wallet_dir).map_err(|e| e.to_string())?;
    let dest_path = wallet_dir.join("wallet.dat");
    if dest_path.exists() {
        return Err(format!("A wallet named '{}' already has data on disk -- pick a different name", wallet_name));
    }
    fs::copy(&source_path, &dest_path).map_err(|e| format!("Failed to copy wallet.dat: {}", e))?;
    let mut creds = get_or_create_creds(&app)?;
    if let Err(e) = rpc_call(&creds, "loadwallet", serde_json::json!([wallet_name])).await {
        let _ = fs::remove_dir_all(&wallet_dir);
        return Err(format!("Node rejected the imported wallet: {}", e));
    }
    creds.active_wallet = wallet_name;
    save_creds(&app, &creds)?;
    Ok(())
}

#[tauri::command]
async fn wallet_list_addresses(app: tauri::AppHandle) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    // include_empty=true, include_watchonly=false -- shows every generated
    // address, not just ones that have received funds.
    rpc_call_wallet(&creds, "listreceivedbyaddress", serde_json::json!([0, true, false])).await
}

#[tauri::command]
async fn wallet_change_passphrase(app: tauri::AppHandle, old_passphrase: String, new_passphrase: String) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "walletpassphrasechange", serde_json::json!([old_passphrase, new_passphrase])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_export_keys(app: tauri::AppHandle) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let datadir = get_datadir(&app)?;
    let filename = format!("civicnet-keys-export-{}.txt", chrono_now());
    let full_path = datadir.join("regtest").join(&filename); // TEMP DEV: regtest subdir; use datadir root for mainnet release
    let result = rpc_call_wallet(&creds, "dumpwallet", serde_json::json!([full_path.to_string_lossy()])).await?;
    result.get("filename").and_then(|v| v.as_str()).map(|s| s.to_string())
        .ok_or_else(|| "dumpwallet returned unexpected shape".to_string())
}

fn chrono_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
async fn wallet_import_single_key(app: tauri::AppHandle, privkey: String, label: Option<String>) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "importprivkey", serde_json::json!([privkey, label.unwrap_or_default(), true])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_import_keys(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "importwallet", serde_json::json!([path])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_backup(app: tauri::AppHandle, destination: String) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "backupwallet", serde_json::json!([destination])).await?;
    Ok(())
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TokenBalance {
    token_id: String,
    symbol: String,
    name: String,
    decimals: i64,
    amount: u64,
    metadata_uri: Option<String>,
}

async fn pinata_upload(bytes: Vec<u8>, filename: &str, mime: &str) -> Result<String, String> {
    let jwt = option_env!("PINATA_JWT").unwrap_or("");
    if jwt.is_empty() {
        return Err("Pinata is not configured for this build".to_string());
    }
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str(mime)
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .text("network", "public")
        .part("file", part);
    let client = reqwest::Client::new();
    let res = client
        .post("https://uploads.pinata.cloud/v3/files")
        .bearer_auth(jwt)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Pinata upload failed: {e}"))?;
    let status = res.status();
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Pinata error {status}: {json}"));
    }
    json["data"]["cid"].as_str().map(|s| s.to_string()).ok_or_else(|| format!("Unexpected Pinata response: {json}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogoUploadResult {
    metadata_uri: String,
    metadata_hash: String,
    image_uri: String,
}

#[tauri::command]
async fn wallet_upload_logo(
    path: String,
    symbol: String,
    name: String,
    description: Option<String>,
    website: Option<String>,
    twitter: Option<String>,
    telegram: Option<String>,
) -> Result<LogoUploadResult, String> {
    use sha2::{Digest, Sha256};

    let image_bytes = std::fs::read(&path).map_err(|e| format!("Failed to read image file: {e}"))?;
    let filename = std::path::Path::new(&path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("logo.png")
        .to_string();
    let mime = match filename.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    };

    let image_cid = pinata_upload(image_bytes, &filename, mime).await?;
    let image_uri = format!("ipfs://{image_cid}");

    let mut metadata = serde_json::json!({
        "name": name,
        "symbol": symbol,
        "image": image_uri,
    });
    if let Some(d) = description {
        if !d.is_empty() {
            metadata["description"] = serde_json::json!(d);
        }
    }
    let mut extensions = serde_json::Map::new();
    if let Some(w) = website {
        if !w.is_empty() {
            extensions.insert("website".to_string(), serde_json::json!(w));
        }
    }
    if let Some(t) = twitter {
        if !t.is_empty() {
            extensions.insert("twitter".to_string(), serde_json::json!(t));
        }
    }
    if let Some(tg) = telegram {
        if !tg.is_empty() {
            extensions.insert("telegram".to_string(), serde_json::json!(tg));
        }
    }
    if !extensions.is_empty() {
        metadata["extensions"] = Value::Object(extensions);
    }
    let metadata_str = serde_json::to_string(&metadata).map_err(|e| e.to_string())?;
    let metadata_bytes = metadata_str.into_bytes();

    let mut hasher = Sha256::new();
    hasher.update(&metadata_bytes);
    let metadata_hash = hex::encode(hasher.finalize());

    let json_cid = pinata_upload(metadata_bytes, "metadata.json", "application/json").await?;

    Ok(LogoUploadResult {
        metadata_uri: format!("ipfs://{json_cid}"),
        metadata_hash,
        image_uri,
    })
}

#[tauri::command]
async fn wallet_get_transaction(app: tauri::AppHandle, txid: String) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "gettransaction", serde_json::json!([txid])).await
}

// Filters out any UTXO that also appears in listtokenunspent (i.e. holds
// token data, not pure CIVIC) before treating it as spendable CIVIC.
// Prevents accidentally spending a token-supply/token-balance UTXO as a
// plain fee/funding input, which silently destroys the token's on-chain
// representation (createtoken*tx variants don't recreate a token output
// unless explicitly told to).
async fn filter_out_token_utxos(creds: &RpcCreds, utxos: &[Value]) -> Result<Vec<Value>, String> {
    let all_token_utxos = rpc_call_wallet(creds, "listtokenunspent", serde_json::json!([])).await?;
    let token_outpoints: std::collections::HashSet<(String, i64)> = all_token_utxos
        .as_array()
        .map(|arr| arr.iter()
            .filter_map(|u| Some((u["txid"].as_str()?.to_string(), u["vout"].as_i64()?)))
            .collect())
        .unwrap_or_default();
    Ok(utxos.iter()
        .filter(|u| {
            let key = (u["txid"].as_str().unwrap_or("").to_string(), u["vout"].as_i64().unwrap_or(-1));
            !token_outpoints.contains(&key)
        })
        .cloned()
        .collect())
}

// listtokenunspent scans every token UTXO in the ENTIRE node's tokendb,
// not just ones this wallet can spend (per its own RPC help text). Filters
// a list of token UTXOs down to only those this wallet actually holds the
// private key for -- otherwise Transfer/Burn/Convert Out can silently pick
// an outpoint belonging to a different wallet or a completely different
// person (e.g. a past Transfer's recipient), which then fails to sign with
// a confusing low-level error instead of a clear one.
async fn filter_owned_token_utxos(creds: &RpcCreds, utxos: &[Value]) -> Result<Vec<Value>, String> {
    let mut owned = Vec::new();
    for u in utxos {
        let addr = match u["address"].as_str() {
            Some(a) => a,
            None => continue,
        };
        let info = rpc_call_wallet(creds, "getaddressinfo", serde_json::json!([addr])).await?;
        if info["ismine"].as_bool().unwrap_or(false) {
            owned.push(u.clone());
        }
    }
    Ok(owned)
}

#[tauri::command]
async fn wallet_update_token_metadata(
    app: tauri::AppHandle,
    token_id: String,
    metadata_uri: String,
    metadata_hash: String,
) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;

    let info = rpc_call(&creds, "gettokeninfo", serde_json::json!([token_id])).await?;
    let issuer_address = info["issuerAddress"].as_str().ok_or("Token has no issuer address on record")?;

    let unspent = rpc_call_wallet(&creds, "listunspent", serde_json::json!([1, 9999999, [issuer_address]])).await?;
    let utxos = unspent.as_array().ok_or("listunspent returned unexpected shape")?;
    let clean_utxos = filter_out_token_utxos(&creds, utxos).await?;
    let first = clean_utxos.iter().find(|u| u["spendable"].as_bool().unwrap_or(false)).ok_or("No spendable pure-CIVIC funds at the issuer address to authorize this update (only token-colored or unspendable UTXOs found)")?;
    let txid = first["txid"].as_str().ok_or("Invalid UTXO txid")?;
    let vout = first["vout"].as_i64().ok_or("Invalid UTXO vout")?;

    let inputs = serde_json::json!([{ "txid": txid, "vout": vout }]);
    let token_arg = serde_json::json!({
        "tokenid": token_id,
        "metadataUri": metadata_uri,
        "metadataHash": metadata_hash,
    });
    let raw_tx = rpc_call(&creds, "createtokenmetadataupdatetx", serde_json::json!([inputs, token_arg])).await?
        .as_str().ok_or("createtokenmetadataupdatetx returned unexpected shape")?.to_string();

    // Route any CIVIC change back to the issuer address itself, not a fresh
    // one -- otherwise this address is drained again by this very tx, and
    // the NEXT issuer action (mint, another metadata update) fails the same
    // way this one almost did.
    let funded = rpc_call_wallet(&creds, "fundrawtransaction", serde_json::json!([raw_tx, { "changeAddress": issuer_address }])).await?;
    let funded_hex = funded["hex"].as_str().ok_or("fundrawtransaction returned unexpected shape")?;

    let signed = rpc_call_wallet(&creds, "signrawtransactionwithwallet", serde_json::json!([funded_hex])).await?;
    if !signed["complete"].as_bool().unwrap_or(false) {
        return Err("Failed to sign metadata update transaction".to_string());
    }
    let signed_hex = signed["hex"].as_str().ok_or("signrawtransactionwithwallet returned unexpected shape")?;

    rpc_call(&creds, "sendrawtransaction", serde_json::json!([signed_hex])).await?
        .as_str().map(|s| s.to_string()).ok_or_else(|| "sendrawtransaction returned unexpected shape".to_string())
}

#[tauri::command]
async fn wallet_get_token_info(app: tauri::AppHandle, token_id: String) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "gettokeninfo", serde_json::json!([token_id])).await
}

#[tauri::command]
async fn wallet_list_tokens(app: tauri::AppHandle) -> Result<Vec<TokenBalance>, String> {
    let creds = get_or_create_creds(&app)?;

    let utxos = rpc_call_wallet(&creds, "listtokenunspent", serde_json::json!([])).await?;
    let utxos = utxos.as_array().ok_or("listtokenunspent returned unexpected shape")?;

    // Aggregate by tokenID, but only for UTXOs at addresses this wallet owns.
    use std::collections::HashMap;
    let mut ismine_cache: HashMap<String, bool> = HashMap::new();
    let mut totals: HashMap<String, u64> = HashMap::new();

    for utxo in utxos {
        let address = match utxo["address"].as_str() {
            Some(a) => a.to_string(),
            None => continue,
        };
        let is_mine = match ismine_cache.get(&address) {
            Some(v) => *v,
            None => {
                let info = rpc_call_wallet(&creds, "getaddressinfo", serde_json::json!([address])).await.unwrap_or(Value::Null);
                let mine = info.get("ismine").and_then(|v| v.as_bool()).unwrap_or(false);
                ismine_cache.insert(address.clone(), mine);
                mine
            }
        };
        if !is_mine {
            continue;
        }
        let token_id = utxo["tokenid"].as_str().unwrap_or("").to_string();
        let amount = utxo["amount"].as_u64().unwrap_or(0);
        *totals.entry(token_id).or_insert(0) += amount;
    }

    let mut result = Vec::new();
    for (token_id, amount) in totals {
        if amount == 0 {
            continue;
        }
        let info = rpc_call(&creds, "gettokeninfo", serde_json::json!([token_id])).await.unwrap_or(Value::Null);
        result.push(TokenBalance {
            token_id: token_id.clone(),
            symbol: info.get("symbol").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
            name: info.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
            decimals: info.get("decimals").and_then(|v| v.as_i64()).unwrap_or(0),
            amount,
            metadata_uri: info.get("metadata").and_then(|m| m.get("uri")).and_then(|v| v.as_str()).map(|s| s.to_string()),
        });
    }

    Ok(result)
}

#[derive(Serialize)]
struct LockStatus {
    unlocked: bool,
    staking_only: bool,
    encrypted: bool,
}

#[tauri::command]
async fn wallet_unlock_staking(app: tauri::AppHandle, passphrase: String) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    // 100000000 seconds (~3 years, the RPC's own max clamp) -- staking-only unlock
    // is meant to persist indefinitely until the user explicitly locks again.
    rpc_call_wallet(&creds, "walletpassphrase", serde_json::json!([passphrase, 100000000i64, true])).await?;
    Ok(())
}
#[tauri::command]
async fn wallet_unlock(app: tauri::AppHandle, passphrase: String, staking_only: bool) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    // Full (spend-capable) unlock is kept short (5 min) rather than the
    // indefinite staking-only timeout, since it exposes the ability to move
    // funds, not just stake.
    let timeout: i64 = if staking_only { 100000000 } else { 300 };
    rpc_call_wallet(&creds, "walletpassphrase", serde_json::json!([passphrase, timeout, staking_only])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_lock(app: tauri::AppHandle) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "walletlock", serde_json::json!([])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_get_lock_status(app: tauri::AppHandle) -> Result<LockStatus, String> {
    let creds = get_or_create_creds(&app)?;
    let info = rpc_call_wallet(&creds, "getwalletinfo", serde_json::json!([])).await?;
    let encrypted = info.get("unlocked_until").is_some();
    let unlocked_until = info.get("unlocked_until").and_then(|v| v.as_i64()).unwrap_or(0);
    let staking_only = info.get("unlocked_for_staking_only").and_then(|v| v.as_bool()).unwrap_or(false);
    Ok(LockStatus {
        unlocked: unlocked_until > 0,
        staking_only,
        encrypted,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateTokenResult {
    token_id: String,
    txid: String,
}

#[tauri::command]
async fn wallet_encrypt(app: tauri::AppHandle, passphrase: String) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call_wallet(&creds, "encryptwallet", serde_json::json!([passphrase])).await?
        .as_str().map(|s| s.to_string()).ok_or_else(|| "encryptwallet returned unexpected shape".to_string())
}

#[tauri::command]
async fn wallet_create_token(
    app: tauri::AppHandle,
    symbol: String,
    name: String,
    decimals: i64,
    initial_supply: i64,
    reserve_lock_amount: f64,
    capped: bool,
    supply_cap: Option<i64>,
) -> Result<CreateTokenResult, String> {
    let creds = get_or_create_creds(&app)?;

    // Pick a spendable UTXO as the first input -- this fixes the token's ID
    // (hash of this input's outpoint), matching createtokenissuetx's design.
    let unspent = rpc_call_wallet(&creds, "listunspent", serde_json::json!([1, 9999999])).await?;
    let utxos = unspent.as_array().ok_or("listunspent returned unexpected shape")?;
    let clean_utxos = filter_out_token_utxos(&creds, utxos).await?;
    let first = clean_utxos.iter().find(|u| u["spendable"].as_bool().unwrap_or(false)).ok_or("No spendable pure-CIVIC funds available to create a token (only token-colored or unspendable UTXOs found)")?;
    let txid = first["txid"].as_str().ok_or("Invalid UTXO txid")?;
    let vout = first["vout"].as_i64().ok_or("Invalid UTXO vout")?;

    // The issuer address (consensus-defined as this input's own address) gets
    // BOTH the initial token supply AND any leftover CIVIC change -- not a
    // freshly generated address. Mint/metadata-update authorization is tied
    // to this exact address, so scattering funds to new addresses leaves it
    // empty and unable to authorize any future issuer action on this token.
    let issuer_address = first["address"].as_str().ok_or("Selected UTXO has no address")?.to_string();
    let mint_address = issuer_address.clone();

    let mut token_obj = serde_json::json!({
        "symbol": symbol,
        "name": name,
        "decimals": decimals,
        "initialSupply": initial_supply,
        "reserveLockAmount": reserve_lock_amount,
        "mintAddress": mint_address,
    });
    if capped {
        token_obj["capped"] = serde_json::json!(true);
        token_obj["supplyCap"] = serde_json::json!(supply_cap.unwrap_or(initial_supply));
    }

    let inputs = serde_json::json!([{ "txid": txid, "vout": vout }]);
    let raw_tx = rpc_call(&creds, "createtokenissuetx", serde_json::json!([inputs, token_obj])).await?
        .as_str().ok_or("createtokenissuetx returned unexpected shape")?.to_string();

    // Decode to read the derived tokenId and the current vout count -- fund's
    // change output must land AFTER all token-payload vouts, or the token
    // vout indices shift and issuance fails (bad-token-initial-supply).
    let decoded = rpc_call(&creds, "decoderawtransaction", serde_json::json!([raw_tx])).await?;
    let token_id = decoded["token"]["tokenId"].as_str().ok_or("Failed to read tokenId from issuance tx")?.to_string();
    let vout_count = decoded["vout"].as_array().map(|v| v.len()).unwrap_or(0);

    let funded = rpc_call_wallet(&creds, "fundrawtransaction", serde_json::json!([raw_tx, { "changePosition": vout_count, "changeAddress": issuer_address }])).await?;
    let funded_hex = funded["hex"].as_str().ok_or("fundrawtransaction returned unexpected shape")?;

    let signed = rpc_call_wallet(&creds, "signrawtransactionwithwallet", serde_json::json!([funded_hex])).await?;
    if !signed["complete"].as_bool().unwrap_or(false) {
        return Err("Failed to sign token issuance transaction".to_string());
    }
    let signed_hex = signed["hex"].as_str().ok_or("signrawtransactionwithwallet returned unexpected shape")?;

    let result_txid = rpc_call(&creds, "sendrawtransaction", serde_json::json!([signed_hex])).await?
        .as_str().ok_or("sendrawtransaction returned unexpected shape")?.to_string();

    Ok(CreateTokenResult { token_id, txid: result_txid })
}

#[tauri::command]
async fn wallet_transfer_token(
    app: tauri::AppHandle,
    token_id: String,
    to_address: String,
    amount: i64,
) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let utxos_val = rpc_call_wallet(&creds, "listtokenunspent", serde_json::json!([token_id])).await?;
    let all_utxos = utxos_val.as_array().ok_or("listtokenunspent returned unexpected shape")?;
    let utxos = filter_owned_token_utxos(&creds, all_utxos).await?;

    // Greedily select token UTXOs until the requested amount is covered.
    // Also remember which address these came from -- both the leftover
    // token change AND the CIVIC fee change route back to it below, so
    // repeatedly using Transfer never scatters funds away from an address
    // that may need to authorize a future Mint/Metadata Update (issuer-only
    // actions require a spendable UTXO at the issuer's own address).
    let mut inputs = Vec::new();
    let mut total: i64 = 0;
    let mut source_address: Option<String> = None;
    for u in &utxos {
        if total >= amount { break; }
        let txid = u["txid"].as_str().ok_or("Invalid token UTXO txid")?;
        let vout = u["vout"].as_i64().ok_or("Invalid token UTXO vout")?;
        let utxo_amount = u["amount"].as_i64().ok_or("Invalid token UTXO amount")?;
        if source_address.is_none() {
            source_address = u["address"].as_str().map(|s| s.to_string());
        }
        inputs.push(serde_json::json!({ "txid": txid, "vout": vout }));
        total += utxo_amount;
    }
    if total < amount {
        return Err("Not enough token balance to send this amount".to_string());
    }
    let source_address = source_address.ok_or("Could not determine the source address of the selected token UTXOs")?;

    let mut outputs = vec![serde_json::json!({ "address": to_address, "tokenid": token_id, "amount": amount })];
    let leftover = total - amount;
    if leftover > 0 {
        outputs.push(serde_json::json!({ "address": source_address, "tokenid": token_id, "amount": leftover }));
    }

    let raw_tx = rpc_call(&creds, "createtokentransfertx", serde_json::json!([inputs, outputs])).await?
        .as_str().ok_or("createtokentransfertx returned unexpected shape")?.to_string();
    let funded = rpc_call_wallet(&creds, "fundrawtransaction", serde_json::json!([raw_tx, { "changeAddress": source_address }])).await?;
    let funded_hex = funded["hex"].as_str().ok_or("fundrawtransaction returned unexpected shape")?;
    let signed = rpc_call_wallet(&creds, "signrawtransactionwithwallet", serde_json::json!([funded_hex])).await?;
    if !signed["complete"].as_bool().unwrap_or(false) {
        return Err(format!("Failed to sign token transfer transaction: {}", signed["errors"]));
    }
    let signed_hex = signed["hex"].as_str().ok_or("signrawtransactionwithwallet returned unexpected shape")?;
    let result_txid = rpc_call(&creds, "sendrawtransaction", serde_json::json!([signed_hex])).await?
        .as_str().ok_or("sendrawtransaction returned unexpected shape")?.to_string();
    Ok(result_txid)
}

#[tauri::command]
async fn wallet_mint_token(app: tauri::AppHandle, token_id: String, amount_to_mint: i64) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let info = rpc_call(&creds, "gettokeninfo", serde_json::json!([token_id])).await?;
    let issuer_address = info["issuerAddress"].as_str().ok_or("Token has no issuer address on record")?.to_string();
    let unspent = rpc_call_wallet(&creds, "listunspent", serde_json::json!([1, 9999999, [issuer_address.clone()]])).await?;
    let utxos = unspent.as_array().ok_or("listunspent returned unexpected shape")?;
    let clean_utxos = filter_out_token_utxos(&creds, utxos).await?;
    let first = clean_utxos.iter().find(|u| u["spendable"].as_bool().unwrap_or(false)).ok_or("No spendable pure-CIVIC funds at the issuer address to authorize minting (only token-colored or unspendable UTXOs found)")?;
    let txid = first["txid"].as_str().ok_or("Invalid UTXO txid")?;
    let vout = first["vout"].as_i64().ok_or("Invalid UTXO vout")?;
    let inputs = serde_json::json!([{ "txid": txid, "vout": vout }]);
    let token_arg = serde_json::json!({
        "tokenid": token_id,
        "amountToMint": amount_to_mint,
        "mintAddress": issuer_address,
    });
    let raw_tx = rpc_call(&creds, "createtokenminttx", serde_json::json!([inputs, token_arg])).await?
        .as_str().ok_or("createtokenminttx returned unexpected shape")?.to_string();
    let funded = rpc_call_wallet(&creds, "fundrawtransaction", serde_json::json!([raw_tx, { "changeAddress": issuer_address }])).await?;
    let funded_hex = funded["hex"].as_str().ok_or("fundrawtransaction returned unexpected shape")?;
    let signed = rpc_call_wallet(&creds, "signrawtransactionwithwallet", serde_json::json!([funded_hex])).await?;
    if !signed["complete"].as_bool().unwrap_or(false) {
        return Err(format!("Failed to sign mint transaction: {}", signed["errors"]));
    }
    let signed_hex = signed["hex"].as_str().ok_or("signrawtransactionwithwallet returned unexpected shape")?;
    let result_txid = rpc_call_wallet(&creds, "sendrawtransaction", serde_json::json!([signed_hex])).await?
        .as_str().ok_or("sendrawtransaction returned unexpected shape")?.to_string();
    Ok(result_txid)
}
#[tauri::command]
async fn wallet_burn_token(app: tauri::AppHandle, token_id: String, amount_to_burn: i64) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let utxos_val = rpc_call_wallet(&creds, "listtokenunspent", serde_json::json!([token_id])).await?;
    let all_utxos = utxos_val.as_array().ok_or("listtokenunspent returned unexpected shape")?;
    let utxos = filter_owned_token_utxos(&creds, all_utxos).await?;

    let mut inputs = Vec::new();
    let mut total: i64 = 0;
    let mut source_address: Option<String> = None;
    for u in &utxos {
        if total >= amount_to_burn { break; }
        let txid = u["txid"].as_str().ok_or("Invalid token UTXO txid")?;
        let vout = u["vout"].as_i64().ok_or("Invalid token UTXO vout")?;
        let utxo_amount = u["amount"].as_i64().ok_or("Invalid token UTXO amount")?;
        if source_address.is_none() {
            source_address = u["address"].as_str().map(|s| s.to_string());
        }
        inputs.push(serde_json::json!({ "txid": txid, "vout": vout }));
        total += utxo_amount;
    }
    if total < amount_to_burn {
        return Err("Not enough token balance to burn this amount".to_string());
    }
    let source_address = source_address.ok_or("Could not determine the source address of the selected token UTXOs")?;

    let mut token_arg = serde_json::json!({
        "tokenid": token_id,
        "amountToBurn": amount_to_burn,
    });
    let leftover = total - amount_to_burn;
    if leftover > 0 {
        token_arg["changeAddress"] = serde_json::json!(source_address);
    }
    let raw_tx = rpc_call(&creds, "createtokenburntx", serde_json::json!([inputs, token_arg])).await?
        .as_str().ok_or("createtokenburntx returned unexpected shape")?.to_string();
    let funded = rpc_call_wallet(&creds, "fundrawtransaction", serde_json::json!([raw_tx, { "changeAddress": source_address }])).await?;
    let funded_hex = funded["hex"].as_str().ok_or("fundrawtransaction returned unexpected shape")?;
    let signed = rpc_call_wallet(&creds, "signrawtransactionwithwallet", serde_json::json!([funded_hex])).await?;
    if !signed["complete"].as_bool().unwrap_or(false) {
        return Err(format!("Failed to sign burn transaction: {}", signed["errors"]));
    }
    let signed_hex = signed["hex"].as_str().ok_or("signrawtransactionwithwallet returned unexpected shape")?;
    let result_txid = rpc_call_wallet(&creds, "sendrawtransaction", serde_json::json!([signed_hex])).await?
        .as_str().ok_or("sendrawtransaction returned unexpected shape")?.to_string();
    Ok(result_txid)
}
#[tauri::command]
async fn wallet_convert_token(
    app: tauri::AppHandle,
    token_id: String,
    amount_to_burn: i64,
) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;

    // Locate the token's reserve-lock UTXO. It is not owned by any wallet
    // (unspendable by any key) so it can't be found via listunspent -- we
    // rely on it still being at (issueTxid, 0), which only holds if this
    // token has never had a prior partial redemption.
    let info = rpc_call(&creds, "gettokeninfo", serde_json::json!([token_id])).await?;
    let issue_txid = info["issueTxid"].as_str().ok_or("Could not read this token's issuance txid")?;
    let reserve_out = rpc_call(&creds, "gettxout", serde_json::json!([issue_txid, 0])).await?;
    if reserve_out.is_null() || reserve_out["scriptPubKey"]["type"].as_str() != Some("token_reserve") {
        return Err("Could not automatically locate this token's reserve funds -- it may have already been partially redeemed before, which isn't supported yet".to_string());
    }

    let utxos_val = rpc_call_wallet(&creds, "listtokenunspent", serde_json::json!([token_id])).await?;
    let all_utxos = utxos_val.as_array().ok_or("listtokenunspent returned unexpected shape")?;
    let utxos = filter_owned_token_utxos(&creds, all_utxos).await?;
    let mut token_inputs = Vec::new();
    let mut token_total: i64 = 0;
    let mut token_source_address: Option<String> = None;
    for u in &utxos {
        if token_total >= amount_to_burn { break; }
        let txid = u["txid"].as_str().ok_or("Invalid token UTXO txid")?;
        let vout = u["vout"].as_i64().ok_or("Invalid token UTXO vout")?;
        let utxo_amount = u["amount"].as_i64().ok_or("Invalid token UTXO amount")?;
        if token_source_address.is_none() {
            token_source_address = u["address"].as_str().map(|s| s.to_string());
        }
        token_inputs.push(serde_json::json!({ "txid": txid, "vout": vout }));
        token_total += utxo_amount;
    }
    if token_total < amount_to_burn {
        return Err("Not enough token balance to redeem this amount".to_string());
    }
    let token_source_address = token_source_address.ok_or("Could not determine the source address of the selected token UTXOs")?;

    // createtokenconverttx cannot be funded via fundrawtransaction (the
    // reserve input's size isn't wallet-controlled) -- select a CIVIC UTXO
    // and pass fee/change explicitly instead, per the RPC's own contract.
    let civic_unspent = rpc_call_wallet(&creds, "listunspent", serde_json::json!([1, 9999999])).await?;
    let civic_utxos = civic_unspent.as_array().ok_or("listunspent returned unexpected shape")?;
    let civic_clean = filter_out_token_utxos(&creds, civic_utxos).await?;
    let civic_utxo = civic_clean.iter().find(|u| u["spendable"].as_bool().unwrap_or(false))
        .ok_or("No spendable pure-CIVIC available to pay the redemption fee (only token-colored or unspendable UTXOs found)")?;
    let civic_txid = civic_utxo["txid"].as_str().ok_or("Invalid CIVIC UTXO txid")?;
    let civic_vout = civic_utxo["vout"].as_i64().ok_or("Invalid CIVIC UTXO vout")?;
    let civic_value = (civic_utxo["amount"].as_f64().ok_or("Invalid CIVIC UTXO amount")? * 100_000_000.0).round() as i64;
    let fee_amount: i64 = 100_000; // flat 0.001 CIVIC, consistent with other fees seen on this network
    if civic_value <= fee_amount {
        return Err("Selected CIVIC funding is too small to cover the redemption fee".to_string());
    }

    // Route both the redeemed CIVIC and its fee-change back to the address
    // that already held the token (or the CIVIC funding UTXO for the fee
    // change), instead of scattering to fresh addresses each time -- keeps
    // repeated Redeem/Convert Out usage consistent with Transfer/Burn.
    let redemption_address = token_source_address.clone();
    let civic_source_address = civic_utxo["address"].as_str().ok_or("Selected CIVIC UTXO has no address")?.to_string();
    let change_address = civic_source_address;

    let mut inputs = vec![serde_json::json!({ "txid": issue_txid, "vout": 0 })];
    inputs.extend(token_inputs);
    inputs.push(serde_json::json!({ "txid": civic_txid, "vout": civic_vout }));

    let mut token_params = serde_json::json!({
        "tokenid": token_id,
        "amountToBurn": amount_to_burn,
        "redemptionAddress": redemption_address,
        "feeAmount": fee_amount as f64 / 100_000_000.0,
        "changeAddress": change_address,
    });
    let token_leftover = token_total - amount_to_burn;
    if token_leftover > 0 {
        token_params["tokenChangeAddress"] = serde_json::json!(token_source_address);
    }

    let raw_tx = rpc_call(&creds, "createtokenconverttx", serde_json::json!([inputs, token_params])).await?
        .as_str().ok_or("createtokenconverttx returned unexpected shape")?.to_string();
    let signed = rpc_call_wallet(&creds, "signrawtransactionwithwallet", serde_json::json!([raw_tx])).await?;
    if !signed["complete"].as_bool().unwrap_or(false) {
        // The reserve-lock input is deliberately exempted from script
        // verification at the consensus level (tokenvalidation.cpp inserts
        // its index into skipInputs for TOKEN_TX_CONVERT_OUT) -- it never
        // needs a real signature, so signrawtransactionwithwallet reporting
        // it as unsigned is expected, not a real failure. Only treat this
        // as a genuine error if something OTHER than that one known input
        // failed to sign.
        let only_reserve_input_unsigned = signed["errors"].as_array()
            .map(|errs| errs.iter().all(|e| {
                e["txid"].as_str() == Some(issue_txid) && e["vout"].as_i64() == Some(0)
            }))
            .unwrap_or(false);
        if !only_reserve_input_unsigned {
            return Err(format!("Failed to sign redemption transaction: {}", signed["errors"]));
        }
    }
    let signed_hex = signed["hex"].as_str().ok_or("signrawtransactionwithwallet returned unexpected shape")?;
    let result_txid = rpc_call(&creds, "sendrawtransaction", serde_json::json!([signed_hex])).await?
        .as_str().ok_or("sendrawtransaction returned unexpected shape")?.to_string();
    Ok(result_txid)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(NodeProcess(Mutex::new(None)))
        .setup(|_app| {
            // Windows-only: tie the sidecar civicnet-node's lifetime to this
            // process at the OS level via a Job Object with KILL_ON_JOB_CLOSE.
            // This guarantees the sidecar is terminated by Windows itself if
            // this app dies in ANY way -- crash, force-kill via Task Manager,
            // power loss -- not just the normal-close paths that our own
            // graceful_shutdown code covers. Without this, a force-killed app
            // leaves civicnet-node.exe orphaned, holding the datadir lock.
            #[cfg(target_os = "windows")]
            {
                let job = win32job::Job::create().map_err(|e| e.to_string())?;
                let mut info = job.query_extended_limit_info().map_err(|e| e.to_string())?;
                info.limit_kill_on_job_close();
                job.set_extended_limit_info(&info).map_err(|e| e.to_string())?;
                job.assign_current_process().map_err(|e| e.to_string())?;
                // Leak the handle so the job stays alive for the process's
                // entire lifetime instead of being dropped (and closed) here.
                std::mem::forget(job);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_node,
            stop_node,
            is_node_running,
            exit_app,
            get_node_status,
            wallet_get_balance,
            wallet_get_new_address,
            wallet_list_transactions,
            wallet_send_to_address,
            wallet_create_wallet,
            wallet_list_all,
            wallet_create_named,
            wallet_switch,
            wallet_get_active,
            wallet_import_walletdat,
            wallet_unlock_staking,
            wallet_unlock,
            wallet_lock,
            wallet_get_lock_status,
            wallet_create_token,
            wallet_transfer_token,
            wallet_convert_token,
            wallet_mint_token,
            wallet_burn_token,
            wallet_list_addresses,
            wallet_backup,
            get_app_version,
            wallet_list_tokens,
            wallet_get_token_info,
            wallet_get_transaction,
            wallet_upload_logo,
            wallet_update_token_metadata,
            wallet_change_passphrase,
            wallet_export_keys,
            wallet_import_keys,
            wallet_import_single_key,
            wallet_encrypt
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use tauri::Manager;
                api.prevent_close();
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app.state::<NodeProcess>();
                    graceful_shutdown(&app, &state).await;
                    app.exit(0);
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
