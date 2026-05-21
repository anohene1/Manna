//! AI sermon summarization via Anthropic Claude API.
//!
//! Frontend should pass the API key from settings; we never persist or read keys here.

use serde::{Deserialize, Serialize};
use std::time::Duration;

const PROMPT: &str = "You are a church sermon notes assistant. Summarize this sermon transcript into clear, concise notes. Work with whatever content is available — even if the transcript is short, fragmented, or from a test recording.

Always produce useful notes. Never refuse or say the transcript is insufficient. Extract whatever you can.

Format:
## Topic
[Best guess at the main theme based on what was said]

## Key Verses
[Any Bible verses mentioned or referenced, even indirectly]

## Main Points
[3-5 bullet points summarizing what was discussed]

## Takeaways
[1-3 practical takeaways for the congregation]

Transcript:
";

const MODELS: &[&str] = &["claude-haiku-4-5-20251001", "claude-sonnet-4-6"];
const MAX_TRANSCRIPT_CHARS: usize = 12_000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Serialize)]
struct Message<'a> {
    role: &'a str,
    content: String,
}

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: Vec<Message<'a>>,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[tauri::command]
pub async fn summarize_sermon(api_key: String, transcript: String) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("Claude API key not configured. Add it in Settings → API Keys.".into());
    }

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    let truncated = if transcript.len() > MAX_TRANSCRIPT_CHARS {
        &transcript[..MAX_TRANSCRIPT_CHARS]
    } else {
        transcript.as_str()
    };
    let content = format!("{PROMPT}{truncated}");

    let mut last_error = String::new();

    for model in MODELS {
        let body = AnthropicRequest {
            model,
            max_tokens: 1024,
            messages: vec![Message {
                role: "user",
                content: content.clone(),
            }],
        };

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let parsed: AnthropicResponse = r.json().await.map_err(|e| e.to_string())?;
                return parsed
                    .content
                    .into_iter()
                    .next()
                    .map(|b| b.text)
                    .ok_or_else(|| "Empty response from Claude".to_string());
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                if !text.contains("overloaded") {
                    return Err(format!("Claude API error ({status}): {text}"));
                }
                last_error = text;
            }
            Err(e) => {
                last_error = e.to_string();
            }
        }
    }

    Err(format!(
        "Claude API failed after retries: {last_error}. Try again in a minute."
    ))
}
