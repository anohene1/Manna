//! AI sermon summarization via DeepSeek API (OpenAI-compatible).
//!
//! Frontend passes the API key from settings; we never persist or read keys here.

use serde::{Deserialize, Serialize};
use std::time::Duration;

const PROMPT_HEAD: &str = "You are a church sermon notes assistant. Produce structured notes from the transcript below. Always return JSON — never refuse, never say the transcript is insufficient. Extract whatever you can.\n\nReturn ONLY a JSON object with this exact shape:\n\n{\n  \"topic\": \"<one-sentence main theme>\",\n  \"key_verses\": [\"<book chapter:verse>\", ...],\n  \"main_points\": [\"<point 1>\", \"<point 2>\", ...],\n  \"takeaways\": [\"<takeaway 1>\", \"<takeaway 2>\", \"<takeaway 3>\", \"<takeaway 4>\", \"<takeaway 5>\"],\n  \"quotes\": [{\"text\": \"<memorable line>\", \"speaker\": \"<preacher name or empty>\"}, ...]\n}\n\nRules:\n- `takeaways` MUST contain exactly 5 short, practical bullets (8-14 words each) suitable for a closing slide.\n- `main_points` is 3-5 bullets summarizing the message.\n- `key_verses` lists references actually preached on (use the operator-confirmed verses below if given, otherwise infer from transcript).\n- `quotes` is 3-5 short, standalone, share-worthy lines pulled VERBATIM from the transcript (8-25 words each). Each must be a complete thought that reads well out of context — the kind of line a congregant would screenshot. Prefer original phrasing of the preacher, NOT scripture quotations. Leave the array empty only if the transcript truly has none.\n- Do not invent quotes; only pull lines the speaker actually said.\n- No markdown, no prose outside the JSON.\n";

const MODELS: &[&str] = &["deepseek-chat", "deepseek-reasoner"];
const MAX_TRANSCRIPT_CHARS: usize = 12_000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const DEEPSEEK_ENDPOINT: &str = "https://api.deepseek.com/v1/chat/completions";

#[derive(Serialize)]
struct Message<'a> {
    role: &'a str,
    content: String,
}

#[derive(Serialize)]
struct DeepSeekRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: Vec<Message<'a>>,
    // Force JSON output — DeepSeek honors OpenAI's response_format field.
    response_format: ResponseFormat,
    temperature: f32,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Deserialize)]
struct DeepSeekResponse {
    choices: Vec<DeepSeekChoice>,
}

#[derive(Deserialize)]
struct DeepSeekChoice {
    message: DeepSeekMessage,
}

#[derive(Deserialize)]
struct DeepSeekMessage {
    content: String,
}

#[tauri::command]
pub async fn summarize_sermon(
    api_key: String,
    transcript: String,
    presented_verses: Option<Vec<String>>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("DeepSeek API key not configured. Add it in Settings → API Keys.".into());
    }

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    let truncated = if transcript.len() > MAX_TRANSCRIPT_CHARS {
        // Walk to a char boundary — raw byte slicing panics mid-codepoint
        // (smart quotes, em-dashes, non-English text are multi-byte UTF-8).
        let end = transcript
            .char_indices()
            .take_while(|(i, _)| *i <= MAX_TRANSCRIPT_CHARS)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(0);
        &transcript[..end]
    } else {
        transcript.as_str()
    };
    let verses_block = match presented_verses {
        Some(v) if !v.is_empty() => format!(
            "\nOperator-confirmed verses preached (use these as `key_verses`):\n- {}\n",
            v.join("\n- ")
        ),
        _ => String::new(),
    };
    let content = format!("{PROMPT_HEAD}{verses_block}\nTranscript:\n{truncated}");

    let mut last_error = String::new();

    for model in MODELS {
        let body = DeepSeekRequest {
            model,
            max_tokens: 1024,
            messages: vec![Message {
                role: "user",
                content: content.clone(),
            }],
            response_format: ResponseFormat { kind: "json_object" },
            temperature: 0.3,
        };

        let resp = client
            .post(DEEPSEEK_ENDPOINT)
            .bearer_auth(&api_key)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let parsed: DeepSeekResponse = r.json().await.map_err(|e| e.to_string())?;
                return parsed
                    .choices
                    .into_iter()
                    .next()
                    .map(|c| c.message.content)
                    .ok_or_else(|| "Empty response from DeepSeek".to_string());
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                // Retry on transient overload / rate limit; bubble up auth + bad-request errors.
                let transient = text.contains("overloaded")
                    || text.contains("rate_limit")
                    || status.as_u16() == 503
                    || status.as_u16() == 429;
                if !transient {
                    return Err(format!("DeepSeek API error ({status}): {text}"));
                }
                last_error = text;
            }
            Err(e) => {
                last_error = e.to_string();
            }
        }
    }

    Err(format!(
        "DeepSeek API failed after retries: {last_error}. Try again in a minute."
    ))
}

// ── Live in-service notes ──────────────────────────────────────────────────

const LIVE_NOTES_PROMPT: &str = "You assist a churchgoer who is writing personal sermon notes as the preacher speaks. Read the transcript-so-far and emit 1-2 NEW bullet points that capture material the existing bullets haven't already covered. Return empty array if no significant new material.\n\nReturn ONLY a JSON object: {\"bullets\": [\"...\", \"...\"]}\n\nVOICE — critical:\n- Write as if the listener jotted the point down for themselves later. First-person, declarative, action-oriented.\n- NEVER use reported speech (\"the preacher says...\", \"he emphasizes...\", \"pastor mentions...\"). Drop the speaker entirely; just write the truth/teaching itself.\n- Examples of GOOD style: \"Prayer is the daily anchor of faith\", \"Forgiveness frees the one who forgives\", \"Trust grows by surrendering control\", \"Worship is how we remember God's character\".\n- Examples of BAD style (DO NOT produce): \"The preacher emphasizes prayer is the anchor\", \"He says that forgiveness frees us\", \"Pastor mentions we should trust God\".\n\nRules:\n- Each bullet 6-14 words, plain text, no markdown.\n- Skip filler, transcription noise, scripture quotations.\n- Do not repeat or paraphrase any existing bullet below.\n- Focus on teachings/exhortations the listener would want to remember, not narration of what was said.\n";

#[derive(Deserialize)]
struct LiveNotesPayload {
    bullets: Vec<String>,
}

#[tauri::command]
pub async fn generate_live_notes(
    api_key: String,
    transcript: String,
    existing_bullets: Vec<String>,
) -> Result<Vec<String>, String> {
    if api_key.trim().is_empty() {
        return Err("DeepSeek API key not configured. Add it in Settings → API Keys.".into());
    }
    if transcript.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    let truncated = if transcript.len() > MAX_TRANSCRIPT_CHARS {
        // Tail slice on a char boundary — raw byte slice panics mid-codepoint.
        let target = transcript.len() - MAX_TRANSCRIPT_CHARS;
        let start = transcript
            .char_indices()
            .find(|(i, _)| *i >= target)
            .map(|(i, _)| i)
            .unwrap_or(transcript.len());
        &transcript[start..]
    } else {
        transcript.as_str()
    };
    let existing_block = if existing_bullets.is_empty() {
        "(none yet)".to_string()
    } else {
        format!("- {}", existing_bullets.join("\n- "))
    };
    let content = format!(
        "{LIVE_NOTES_PROMPT}\nExisting bullets:\n{existing_block}\n\nTranscript so far:\n{truncated}"
    );

    let mut last_error = String::new();

    for model in MODELS {
        let body = DeepSeekRequest {
            model,
            max_tokens: 256,
            messages: vec![Message {
                role: "user",
                content: content.clone(),
            }],
            response_format: ResponseFormat { kind: "json_object" },
            temperature: 0.4,
        };

        let resp = client
            .post(DEEPSEEK_ENDPOINT)
            .bearer_auth(&api_key)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let parsed: DeepSeekResponse = r.json().await.map_err(|e| e.to_string())?;
                let json_str = parsed
                    .choices
                    .into_iter()
                    .next()
                    .map(|c| c.message.content)
                    .ok_or_else(|| "Empty response from DeepSeek".to_string())?;
                let payload: LiveNotesPayload = serde_json::from_str(&json_str)
                    .map_err(|e| format!("Bad JSON from DeepSeek: {e}"))?;
                let cleaned: Vec<String> = payload
                    .bullets
                    .into_iter()
                    .map(|b| b.trim().to_string())
                    .filter(|b| !b.is_empty())
                    .take(2)
                    .collect();
                return Ok(cleaned);
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                let transient = text.contains("overloaded")
                    || text.contains("rate_limit")
                    || status.as_u16() == 503
                    || status.as_u16() == 429;
                if !transient {
                    return Err(format!("DeepSeek API error ({status}): {text}"));
                }
                last_error = text;
            }
            Err(e) => {
                last_error = e.to_string();
            }
        }
    }

    Err(format!("DeepSeek live-notes failed: {last_error}"))
}
