//! AI sermon summarization via DeepSeek API (OpenAI-compatible).
//!
//! Frontend passes the API key from settings; we never persist or read keys here.

use serde::{Deserialize, Serialize};
use std::time::Duration;

const PROMPT_HEAD: &str = "You are a church sermon summary assistant. Produce a rich recap from the transcript below. Always return JSON only. Never refuse, never say the transcript is insufficient. Extract only what the transcript supports.\n\nReturn ONLY a JSON object with this exact shape:\n\n{\n  \"title\": \"<short sermon title>\",\n  \"big_idea\": \"<one-sentence central message>\",\n  \"key_verses\": [\n    {\"reference\": \"<book chapter:verse>\", \"reason\": \"<why this verse mattered in the sermon>\"}\n  ],\n  \"sermon_flow\": {\n    \"opening\": \"<how the sermon opened>\",\n    \"main_points\": [\n      {\n        \"point\": \"<main point>\",\n        \"explanation\": \"<brief explanation grounded in the transcript>\",\n        \"scripture_refs\": [\"<book chapter:verse>\", \"...\"],\n        \"illustration_or_moment\": \"<story, example, or notable moment from the transcript, or empty string>\",\n        \"application\": \"<practical response invited by this point>\"\n      }\n    ],\n    \"conclusion\": \"<how the sermon concluded>\",\n    \"response\": \"<invitation, altar call, prayer focus, or listener response>\"\n  },\n  \"devotional\": {\n    \"scripture\": \"<primary scripture reference and/or short excerpt from the sermon>\",\n    \"observation\": \"<SOAP observation>\",\n    \"application\": \"<SOAP application>\",\n    \"prayer\": \"<SOAP prayer>\",\n    \"reflection_questions\": [\"<question 1>\", \"<question 2>\", \"<question 3>\"]\n  },\n  \"takeaways\": [\"<takeaway 1>\", \"<takeaway 2>\", \"<takeaway 3>\", \"<takeaway 4>\", \"<takeaway 5>\"],\n  \"quotes\": [\n    {\"text\": \"<verbatim quote from transcript>\", \"speaker\": \"<speaker name or Pastor>\"}\n  ]\n}\n\nRules:\n- JSON only, no markdown or prose outside JSON.\n- Never invent scripture refs, quotes, stories, or unsupported claims.\n- Use operator-confirmed verses when provided.\n- Devotional follows SOAP: Scripture, Observation, Application, Prayer.\n- `takeaways` MUST contain exactly 5 practical lines, each 8-14 words.\n- `quotes` must be verbatim from the transcript, 8-25 words each. Prefer pastor phrasing over scripture quotations. Leave the array empty only if the transcript truly has none.\n- Generic speaker should be `Pastor`, not `Preacher`.\n";

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
            max_tokens: 2048,
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

fn build_live_notes_prompt(max_bullets: u32, min_words: u32, max_words: u32) -> String {
    format!(
        "You assist a churchgoer writing personal sermon notes as the preacher speaks. Below is the transcript-so-far PLUS the bullets they have already captured. Your ONLY job is to surface NEW points that are NOT already covered. If everything substantive has already been captured, return an empty array — do NOT pad.\n\nReturn ONLY a JSON object: {{\"bullets\": [\"...\", \"...\"]}}\n\nCOUNT + LENGTH (scales with transcript size):\n- Emit AT MOST {max_bullets} bullet(s). Fewer is fine. Empty array is fine.\n- Each bullet should be roughly {min_words}-{max_words} words.\n\nVOICE — critical:\n- Write as the listener jotting the point down for themselves. First-person, declarative, action-oriented.\n- NEVER use reported speech (\"the preacher says...\", \"he emphasizes...\", \"pastor mentions...\"). Drop the speaker entirely; write the truth/teaching itself.\n- GOOD: \"Prayer is the daily anchor of faith\", \"Forgiveness frees the one who forgives\", \"Trust grows by surrendering control\".\n- BAD: \"The preacher emphasizes prayer is the anchor\", \"He says that forgiveness frees us\".\n\nNON-REPETITION — strict:\n- READ the existing bullets carefully before you draft. If a candidate bullet has the same MEANING as any existing bullet (even with different wording), DROP it.\n- Reject anything that re-summarizes the same idea, theme, or scripture point that's already in the list.\n- Prefer bullets that capture ONLY material from the most recent portion of the transcript (which contains new ground).\n\nRules:\n- Plain text, no markdown.\n- Skip filler, transcription noise, scripture quotations.\n- Focus on teachings/exhortations the listener would want to remember.\n- Empty array is a perfectly valid answer when nothing new has been said.\n"
    )
}

#[derive(Deserialize)]
struct LiveNotesPayload {
    bullets: Vec<String>,
}

/// Scale bullet count + per-bullet word length to the size of the transcript.
/// Returns `(max_bullets, min_words, max_words)`. Tuned for typical sermon
/// pacing — a fresh service produces tight one-liners, a long sermon allows
/// a few denser bullets per click.
fn live_notes_tier(transcript_chars: usize) -> (u32, u32, u32) {
    match transcript_chars {
        0..=999 => (1, 5, 9),
        1000..=3999 => (2, 6, 12),
        4000..=9999 => (3, 7, 14),
        _ => (4, 9, 18),
    }
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

    let (max_bullets, min_words, max_words) = live_notes_tier(transcript.chars().count());
    let prompt_head = build_live_notes_prompt(max_bullets, min_words, max_words);

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
    // Put existing bullets FIRST in the user message so the model reads them
    // before considering the transcript — improves rejection of duplicates.
    let content = format!(
        "EXISTING BULLETS (must not be repeated or paraphrased):\n{existing_block}\n\n{prompt_head}\nTranscript so far:\n{truncated}"
    );

    let mut last_error = String::new();

    for model in MODELS {
        let body = DeepSeekRequest {
            model,
            max_tokens: 512,
            messages: vec![Message {
                role: "user",
                content: content.clone(),
            }],
            response_format: ResponseFormat { kind: "json_object" },
            temperature: 0.75,
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
                // Server-side dedup backstop: drop any bullet whose normalized
                // form is identical to an existing bullet, OR whose first 6
                // significant words overlap with any existing one.
                let existing_norm: Vec<String> =
                    existing_bullets.iter().map(|b| normalize_for_dedup(b)).collect();
                let cleaned: Vec<String> = payload
                    .bullets
                    .into_iter()
                    .map(|b| b.trim().to_string())
                    .filter(|b| !b.is_empty())
                    .filter(|b| {
                        let n = normalize_for_dedup(b);
                        !existing_norm.iter().any(|e| dedup_overlap(e, &n))
                    })
                    .take(max_bullets as usize)
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

/// Lowercase + strip punctuation + collapse whitespace. Used by the dedup
/// backstop so cosmetic differences ("The trust of God!" vs "trust of god")
/// don't slip through.
fn normalize_for_dedup(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c.to_ascii_lowercase() } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// True when two normalized bullets are duplicates: equal, or share their
/// first 6 significant words (when both bullets are long enough — at least
/// 6 words each — so we don't swallow a short existing bullet that happens
/// to be a prefix of a genuinely fuller new one).
fn dedup_overlap(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let words_a: Vec<&str> = a.split_whitespace().collect();
    let words_b: Vec<&str> = b.split_whitespace().collect();
    const HEAD_WORDS: usize = 6;
    if words_a.len() < HEAD_WORDS || words_b.len() < HEAD_WORDS {
        return false;
    }
    words_a[..HEAD_WORDS] == words_b[..HEAD_WORDS]
}
