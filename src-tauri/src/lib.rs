use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;
use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use rand::RngExt;
use rand::distr::Alphanumeric;
use serde_json::Value;

struct NodeProcess(Mutex<Option<CommandChild>>);

#[derive(Serialize, Deserialize, Clone)]
struct RpcCreds {
    user: String,
    pass: String,
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
    let creds = RpcCreds { user: "civicnetwallet".to_string(), pass };
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
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "1.0",
        "id": "civicnet-wallet",
        "method": method,
        "params": params
    });
    let res = client
        .post("http://127.0.0.1:9332")
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
    let (mut _rx, child) = sidecar
        .args([conf_arg.as_str(), datadir_arg.as_str(), "-txindex"])
        .spawn()
        .map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok("Node started".into())
}

#[tauri::command]
fn stop_node(state: tauri::State<NodeProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
        Ok("Node stopped".into())
    } else {
        Ok("Node was not running".into())
    }
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
    let result = rpc_call(&creds, "getbalance", serde_json::json!([])).await?;
    Ok(result.as_f64().unwrap_or(0.0))
}

#[tauri::command]
async fn wallet_get_new_address(app: tauri::AppHandle) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let result = rpc_call(&creds, "getnewaddress", serde_json::json!([])).await?;
    Ok(result.as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn wallet_list_transactions(app: tauri::AppHandle, count: i64) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "listtransactions", serde_json::json!(["*", count])).await
}

#[tauri::command]
async fn wallet_send_to_address(app: tauri::AppHandle, address: String, amount: f64) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let result = rpc_call(&creds, "sendtoaddress", serde_json::json!([address, amount])).await?;
    Ok(result.as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn wallet_create_wallet(app: tauri::AppHandle) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "createwallet", serde_json::json!(["main"])).await
}

#[tauri::command]
async fn wallet_list_addresses(app: tauri::AppHandle) -> Result<Value, String> {
    let creds = get_or_create_creds(&app)?;
    // include_empty=true, include_watchonly=false -- shows every generated
    // address, not just ones that have received funds.
    rpc_call(&creds, "listreceivedbyaddress", serde_json::json!([0, true, false])).await
}

#[tauri::command]
async fn wallet_change_passphrase(app: tauri::AppHandle, old_passphrase: String, new_passphrase: String) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "walletpassphrasechange", serde_json::json!([old_passphrase, new_passphrase])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_export_keys(app: tauri::AppHandle) -> Result<String, String> {
    let creds = get_or_create_creds(&app)?;
    let datadir = get_datadir(&app)?;
    let filename = format!("civicnet-keys-export-{}.txt", chrono_now());
    let full_path = datadir.join("regtest").join(&filename); // TEMP DEV: regtest subdir; use datadir root for mainnet release
    let result = rpc_call(&creds, "dumpwallet", serde_json::json!([full_path.to_string_lossy()])).await?;
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
    rpc_call(&creds, "importprivkey", serde_json::json!([privkey, label.unwrap_or_default(), true])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_import_keys(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "importwallet", serde_json::json!([path])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_backup(app: tauri::AppHandle, destination: String) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "backupwallet", serde_json::json!([destination])).await?;
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
    rpc_call(&creds, "gettransaction", serde_json::json!([txid])).await
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

    let unspent = rpc_call(&creds, "listunspent", serde_json::json!([1, 9999999, [issuer_address]])).await?;
    let utxos = unspent.as_array().ok_or("listunspent returned unexpected shape")?;
    let first = utxos.first().ok_or("No spendable funds at the issuer address to authorize this update")?;
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

    let funded = rpc_call(&creds, "fundrawtransaction", serde_json::json!([raw_tx])).await?;
    let funded_hex = funded["hex"].as_str().ok_or("fundrawtransaction returned unexpected shape")?;

    let signed = rpc_call(&creds, "signrawtransactionwithwallet", serde_json::json!([funded_hex])).await?;
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

    let utxos = rpc_call(&creds, "listtokenunspent", serde_json::json!([])).await?;
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
                let info = rpc_call(&creds, "getaddressinfo", serde_json::json!([address])).await.unwrap_or(Value::Null);
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
    rpc_call(&creds, "walletpassphrase", serde_json::json!([passphrase, 100000000i64, true])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_lock(app: tauri::AppHandle) -> Result<(), String> {
    let creds = get_or_create_creds(&app)?;
    rpc_call(&creds, "walletlock", serde_json::json!([])).await?;
    Ok(())
}

#[tauri::command]
async fn wallet_get_lock_status(app: tauri::AppHandle) -> Result<LockStatus, String> {
    let creds = get_or_create_creds(&app)?;
    let info = rpc_call(&creds, "getwalletinfo", serde_json::json!([])).await?;
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
    rpc_call(&creds, "encryptwallet", serde_json::json!([passphrase])).await?
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
    let unspent = rpc_call(&creds, "listunspent", serde_json::json!([1, 9999999])).await?;
    let utxos = unspent.as_array().ok_or("listunspent returned unexpected shape")?;
    let first = utxos.first().ok_or("No spendable funds available to create a token")?;
    let txid = first["txid"].as_str().ok_or("Invalid UTXO txid")?;
    let vout = first["vout"].as_i64().ok_or("Invalid UTXO vout")?;

    let mint_address = rpc_call(&creds, "getnewaddress", serde_json::json!([])).await?
        .as_str().ok_or("Failed to get mint address")?.to_string();

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

    let funded = rpc_call(&creds, "fundrawtransaction", serde_json::json!([raw_tx, { "changePosition": vout_count }])).await?;
    let funded_hex = funded["hex"].as_str().ok_or("fundrawtransaction returned unexpected shape")?;

    let signed = rpc_call(&creds, "signrawtransactionwithwallet", serde_json::json!([funded_hex])).await?;
    if !signed["complete"].as_bool().unwrap_or(false) {
        return Err("Failed to sign token issuance transaction".to_string());
    }
    let signed_hex = signed["hex"].as_str().ok_or("signrawtransactionwithwallet returned unexpected shape")?;

    let result_txid = rpc_call(&creds, "sendrawtransaction", serde_json::json!([signed_hex])).await?
        .as_str().ok_or("sendrawtransaction returned unexpected shape")?.to_string();

    Ok(CreateTokenResult { token_id, txid: result_txid })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(NodeProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            start_node,
            stop_node,
            is_node_running,
            get_node_status,
            wallet_get_balance,
            wallet_get_new_address,
            wallet_list_transactions,
            wallet_send_to_address,
            wallet_create_wallet,
            wallet_unlock_staking,
            wallet_lock,
            wallet_get_lock_status,
            wallet_create_token,
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
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Ensure the sidecar civicnet-node process is killed when the
                // wallet window closes -- child processes are not
                // automatically terminated with their parent on Windows,
                // so without this the node keeps running in the background
                // (locking the .exe file, blocking reinstalls, etc.).
                use tauri::Manager;
                let child_to_kill = {
                    let state = window.state::<NodeProcess>();
                    let mut guard = match state.0.lock() {
                        Ok(g) => g,
                        Err(_) => return,
                    };
                    guard.take()
                };
                if let Some(child) = child_to_kill {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
