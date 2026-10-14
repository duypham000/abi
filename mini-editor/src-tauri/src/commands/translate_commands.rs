use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryEntry {
    pub word: String,
    pub reverse_translations: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryGroup {
    pub part_of_speech: String,
    pub terms: Vec<String>,
    pub entries: Vec<DictionaryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionItem {
    pub definition: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub example: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionGroup {
    pub part_of_speech: String,
    pub items: Vec<DefinitionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SynonymCluster {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub register: Option<String>,
    pub synonyms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SynonymGroup {
    pub part_of_speech: String,
    pub clusters: Vec<SynonymCluster>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    pub query: String,
    pub source_lang: String,
    pub target_lang: String,
    pub detected_source_language: Option<String>,
    pub main_translation: String,
    pub original_text: String,
    pub dictionary: Vec<DictionaryGroup>,
    pub definitions: Vec<DefinitionGroup>,
    pub synonyms: Vec<SynonymGroup>,
    pub examples: Vec<String>,
    pub cached: bool,
}

// In-memory cache for translations (TTL: 1 hour)
struct CacheItem {
    expires_at: Instant,
    result: TranslationResult,
}

static TRANSLATE_CACHE: Mutex<Option<HashMap<String, CacheItem>>> = Mutex::new(None);

fn get_cached(key: &str) -> Option<TranslationResult> {
    if let Ok(guard) = TRANSLATE_CACHE.lock() {
        if let Some(map) = guard.as_ref() {
            if let Some(item) = map.get(key) {
                if Instant::now() < item.expires_at {
                    let mut res = item.result.clone();
                    res.cached = true;
                    return Some(res);
                }
            }
        }
    }
    None
}

fn set_cached(key: String, result: TranslationResult) {
    if let Ok(mut guard) = TRANSLATE_CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(
            key,
            CacheItem {
                expires_at: Instant::now() + Duration::from_secs(3600),
                result,
            },
        );
    }
}

fn strip_tags(text: &str) -> String {
    text.replace("<b>", "")
        .replace("</b>", "")
        .replace("<i>", "")
        .replace("</i>", "")
        .trim()
        .to_string()
}

pub fn parse_google_response(
    raw: &Value,
    query: &str,
    source_lang: &str,
    target_lang: &str,
) -> TranslationResult {
    let mut result = TranslationResult {
        query: query.to_string(),
        source_lang: source_lang.to_string(),
        target_lang: target_lang.to_string(),
        detected_source_language: None,
        main_translation: String::new(),
        original_text: String::new(),
        dictionary: Vec::new(),
        definitions: Vec::new(),
        synonyms: Vec::new(),
        examples: Vec::new(),
        cached: false,
    };

    let arr = match raw.as_array() {
        Some(a) => a,
        None => return result,
    };

    // [0] Main translation
    if let Some(sec0) = arr.get(0).and_then(|v| v.as_array()) {
        let mut translated = String::new();
        let mut original = String::new();
        for item in sec0 {
            if let Some(seg) = item.as_array() {
                if let Some(t) = seg.get(0).and_then(|v| v.as_str()) {
                    translated.push_str(t);
                }
                if let Some(o) = seg.get(1).and_then(|v| v.as_str()) {
                    original.push_str(o);
                }
            }
        }
        result.main_translation = translated;
        result.original_text = original;
    }

    // [2] Detected source language
    if let Some(lang) = arr.get(2).and_then(|v| v.as_str()) {
        result.detected_source_language = Some(lang.to_string());
    }

    // [1] Dictionary alternatives
    if let Some(sec1) = arr.get(1).and_then(|v| v.as_array()) {
        for group in sec1 {
            if let Some(g) = group.as_array() {
                let part_of_speech = g.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
                let terms: Vec<String> = g.get(1)
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();

                let mut entries = Vec::new();
                if let Some(entry_arr) = g.get(2).and_then(|v| v.as_array()) {
                    for entry in entry_arr {
                        if let Some(e) = entry.as_array() {
                            let word = e.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let reverse_translations: Vec<String> = e.get(1)
                                .and_then(|v| v.as_array())
                                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                                .unwrap_or_default();
                            let score = e.get(3).and_then(|v| v.as_f64());
                            entries.push(DictionaryEntry {
                                word,
                                reverse_translations,
                                score,
                            });
                        }
                    }
                }

                result.dictionary.push(DictionaryGroup {
                    part_of_speech,
                    terms,
                    entries,
                });
            }
        }
    }

    // [12] Definitions
    if let Some(sec12) = arr.get(12).and_then(|v| v.as_array()) {
        for group in sec12 {
            if let Some(g) = group.as_array() {
                let part_of_speech = g.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
                let mut items = Vec::new();
                if let Some(item_arr) = g.get(1).and_then(|v| v.as_array()) {
                    for def in item_arr {
                        if let Some(d) = def.as_array() {
                            if let Some(definition) = d.get(0).and_then(|v| v.as_str()) {
                                let example = d.get(2).and_then(|v| v.as_str()).map(|s| s.to_string());
                                items.push(DefinitionItem {
                                    definition: definition.to_string(),
                                    example,
                                });
                            }
                        }
                    }
                }
                if !items.is_empty() {
                    result.definitions.push(DefinitionGroup {
                        part_of_speech,
                        items,
                    });
                }
            }
        }
    }

    // [11] Synonyms
    if let Some(sec11) = arr.get(11).and_then(|v| v.as_array()) {
        for group in sec11 {
            if let Some(g) = group.as_array() {
                let part_of_speech = g.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
                let mut clusters = Vec::new();
                if let Some(cluster_arr) = g.get(1).and_then(|v| v.as_array()) {
                    for cluster in cluster_arr {
                        if let Some(c) = cluster.as_array() {
                            let synonyms: Vec<String> = c.get(0)
                                .and_then(|v| v.as_array())
                                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                                .unwrap_or_default();
                            
                            let register = c.get(2)
                                .and_then(|v| v.as_array())
                                .and_then(|arr| arr.get(0))
                                .and_then(|v| v.as_array())
                                .and_then(|arr| arr.get(0))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            if !synonyms.is_empty() {
                                clusters.push(SynonymCluster { register, synonyms });
                            }
                        }
                    }
                }
                if !clusters.is_empty() {
                    result.synonyms.push(SynonymGroup {
                        part_of_speech,
                        clusters,
                    });
                }
            }
        }
    }

    // [13] Examples
    if let Some(sec13) = arr.get(13).and_then(|v| v.as_array()) {
        if let Some(ex_list) = sec13.get(0).and_then(|v| v.as_array()) {
            for item in ex_list {
                if let Some(ex) = item.as_array() {
                    if let Some(text) = ex.get(0).and_then(|v| v.as_str()) {
                        result.examples.push(strip_tags(text));
                    }
                }
            }
        }
    }

    result
}

static CLIENT_IDS: &[&str] = &["dict-chrome-ex", "at", "gtx", "t"];
static USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

#[tauri::command]
pub async fn cmd_translate(
    q: String,
    sl: String,
    tl: String,
) -> Result<TranslationResult, String> {
    let query_trimmed = q.trim();
    if query_trimmed.is_empty() {
        return Err("Query cannot be empty".into());
    }

    let cache_key = format!("{}:{}:{}", sl, tl, query_trimmed.to_lowercase());
    if let Some(cached) = get_cached(&cache_key) {
        return Ok(cached);
    }

    let ua = USER_AGENTS[(query_trimmed.len() + sl.len() + tl.len()) % USER_AGENTS.len()];
    let client = reqwest::Client::builder()
        .user_agent(ua)
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let url = "https://translate.googleapis.com/translate_a/single";
    let mut last_err = String::new();

    // 1. Try local Node.js translate microservice on port 8006 first
    let node_url = "http://127.0.0.1:8006/api/v1/translate";
    if let Ok(res) = client
        .get(node_url)
        .query(&[("q", query_trimmed), ("sl", &sl), ("tl", &tl)])
        .timeout(Duration::from_millis(1500))
        .send()
        .await
    {
        if res.status().is_success() {
            if let Ok(parsed) = res.json::<TranslationResult>().await {
                set_cached(cache_key, parsed.clone());
                return Ok(parsed);
            }
        }
    }

    for client_id in CLIENT_IDS {
        let params = [
            ("client", *client_id),
            ("sl", &sl),
            ("tl", &tl),
            ("hl", &tl),
            ("q", query_trimmed),
            ("dt", "t"),
            ("dt", "bd"),
            ("dt", "ss"),
            ("dt", "md"),
            ("dt", "ex"),
        ];

        match client.get(url).query(&params).send().await {
            Ok(res) => {
                if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                    last_err = "429 Too Many Requests: Google Translate rate limit reached. Please wait a few seconds.".into();
                    continue;
                }
                if !res.status().is_success() {
                    last_err = format!("Google Translate API returned status {}", res.status());
                    continue;
                }
                match res.json::<Value>().await {
                    Ok(raw) => {
                        let parsed = parse_google_response(&raw, query_trimmed, &sl, &tl);
                        set_cached(cache_key, parsed.clone());
                        return Ok(parsed);
                    }
                    Err(e) => {
                        last_err = format!("Failed to parse Google API response: {}", e);
                    }
                }
            }
            Err(e) => {
                last_err = format!("Network request failed: {}", e);
            }
        }
    }

    Err(if last_err.is_empty() {
        "Failed to reach Google Translate API".to_string()
    } else {
        last_err
    })
}
