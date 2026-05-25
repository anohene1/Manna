//! Image search via Pexels, Unsplash, and local folder.
//!
//! Frontend passes API keys from settings; we never persist them here.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const PER_PAGE: u32 = 30;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImageHit {
    pub id: String,
    pub url: String,
    pub thumbnail_url: String,
    pub label: String,
    pub provider: String,
    pub photographer: Option<String>,
    pub photographer_url: Option<String>,
    pub width: u32,
    pub height: u32,
}

// ── Pexels ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PexelsResponse {
    photos: Vec<PexelsPhoto>,
}

#[derive(Deserialize)]
struct PexelsPhoto {
    id: u64,
    width: u32,
    height: u32,
    photographer: String,
    photographer_url: String,
    alt: Option<String>,
    src: PexelsSrc,
}

#[derive(Deserialize)]
struct PexelsSrc {
    large2x: String,
    medium: String,
}

#[tauri::command]
pub async fn search_pexels(
    api_key: String,
    query: String,
    page: Option<u32>,
) -> Result<Vec<ImageHit>, String> {
    if api_key.trim().is_empty() {
        return Err("Pexels API key not set. Add it in Settings → API Keys.".into());
    }
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("https://api.pexels.com/v1/search")
        .header("Authorization", &api_key)
        .query(&[
            ("query", q),
            ("per_page", &PER_PAGE.to_string()),
            ("page", &page.unwrap_or(1).to_string()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Pexels error ({status}): {text}"));
    }
    let parsed: PexelsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .photos
        .into_iter()
        .map(|p| ImageHit {
            id: format!("pexels-{}", p.id),
            url: p.src.large2x,
            thumbnail_url: p.src.medium,
            label: p.alt.unwrap_or_default(),
            provider: "pexels".to_string(),
            photographer: Some(p.photographer),
            photographer_url: Some(p.photographer_url),
            width: p.width,
            height: p.height,
        })
        .collect())
}

// ── Unsplash ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct UnsplashResponse {
    results: Vec<UnsplashPhoto>,
}

#[derive(Deserialize)]
struct UnsplashPhoto {
    id: String,
    width: u32,
    height: u32,
    alt_description: Option<String>,
    description: Option<String>,
    urls: UnsplashUrls,
    user: UnsplashUser,
}

#[derive(Deserialize)]
struct UnsplashUrls {
    regular: String,
    small: String,
}

#[derive(Deserialize)]
struct UnsplashUser {
    name: String,
    links: UnsplashUserLinks,
}

#[derive(Deserialize)]
struct UnsplashUserLinks {
    html: String,
}

#[tauri::command]
pub async fn search_unsplash(
    api_key: String,
    query: String,
    page: Option<u32>,
) -> Result<Vec<ImageHit>, String> {
    if api_key.trim().is_empty() {
        return Err("Unsplash API key not set. Add it in Settings → API Keys.".into());
    }
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("https://api.unsplash.com/search/photos")
        .header("Authorization", format!("Client-ID {api_key}"))
        .query(&[
            ("query", q),
            ("per_page", &PER_PAGE.to_string()),
            ("page", &page.unwrap_or(1).to_string()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Unsplash error ({status}): {text}"));
    }
    let parsed: UnsplashResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .results
        .into_iter()
        .map(|p| ImageHit {
            id: format!("unsplash-{}", p.id),
            url: p.urls.regular,
            thumbnail_url: p.urls.small,
            label: p.alt_description.or(p.description).unwrap_or_default(),
            provider: "unsplash".to_string(),
            photographer: Some(p.user.name),
            photographer_url: Some(p.user.links.html),
            width: p.width,
            height: p.height,
        })
        .collect())
}

// ── Brave Image Search ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct BraveResponse {
    #[serde(default)]
    results: Vec<BraveResult>,
}

#[derive(Deserialize)]
struct BraveResult {
    #[serde(default)]
    title: Option<String>,
    /// Source page URL.
    #[serde(default)]
    url: Option<String>,
    /// Publisher / site name.
    #[serde(default)]
    source: Option<String>,
    thumbnail: Option<BraveThumb>,
    properties: Option<BraveProps>,
}

#[derive(Deserialize)]
struct BraveThumb {
    src: Option<String>,
}

#[derive(Deserialize)]
struct BraveProps {
    /// Original image URL on the source site.
    url: Option<String>,
    /// Width / height when available.
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}

#[tauri::command]
pub async fn search_brave_images(
    api_key: String,
    query: String,
    safesearch: Option<String>,
) -> Result<Vec<ImageHit>, String> {
    if api_key.trim().is_empty() {
        return Err("Brave API key not set. Add it in Settings → API Keys.".into());
    }
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let safe = safesearch.as_deref().unwrap_or("strict");
    let count_str = PER_PAGE.to_string();
    let resp = client
        .get("https://api.search.brave.com/res/v1/images/search")
        .header("X-Subscription-Token", &api_key)
        .header("Accept", "application/json")
        .query(&[("q", q), ("count", count_str.as_str()), ("safesearch", safe)])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Brave error ({status}): {text}"));
    }
    let parsed: BraveResponse = resp.json().await.map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(parsed.results.len());
    for (i, r) in parsed.results.into_iter().enumerate() {
        let thumb = r.thumbnail.as_ref().and_then(|t| t.src.clone()).unwrap_or_default();
        let full = r
            .properties
            .as_ref()
            .and_then(|p| p.url.clone())
            .or_else(|| Some(thumb.clone()))
            .unwrap_or_default();
        if full.is_empty() {
            continue;
        }
        let (w, h) = r
            .properties
            .as_ref()
            .map(|p| (p.width.unwrap_or(0), p.height.unwrap_or(0)))
            .unwrap_or((0, 0));
        out.push(ImageHit {
            id: format!("brave-{i}"),
            url: full,
            thumbnail_url: if thumb.is_empty() {
                out.last().map(|h| h.url.clone()).unwrap_or_default()
            } else {
                thumb
            },
            label: r.title.unwrap_or_default(),
            provider: "brave".to_string(),
            photographer: r.source,
            photographer_url: r.url,
            width: w,
            height: h,
        });
    }
    Ok(out)
}

// ── Local folder ────────────────────────────────────────────────────────

const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "avif", "heic", "heif", "svg",
    "ico", "jfif", "pjpeg", "pjp", "apng",
];

#[tauri::command]
pub fn list_local_images(folder: String) -> Result<Vec<ImageHit>, String> {
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err(format!("Folder not found: {folder}"));
    }
    let mut hits = Vec::new();
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let file_path = entry.path();
        if !file_path.is_file() {
            continue;
        }
        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let name = file_path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("image")
            .to_string();
        // Frontend converts this raw path to an `asset:` URL via Tauri's
        // convertFileSrc(), bypassing webview CSP for local files.
        let url = file_path.to_string_lossy().to_string();
        hits.push(ImageHit {
            id: format!("local-{url}"),
            url: url.clone(),
            thumbnail_url: url,
            label: name,
            provider: "local".to_string(),
            photographer: None,
            photographer_url: None,
            width: 0,
            height: 0,
        });
    }
    hits.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    Ok(hits)
}

/// Reads a local image into a base64 data URL. Broadcast windows can't reliably
/// fetch `asset://` URLs across processes in all webview configurations, so
/// callers route local-image broadcasts through a self-contained data URL.
/// Validate that `path` is an image inside `folder` (no traversal escapes).
/// Caller must pass the user-configured `localImageFolder` — we canonicalize
/// both sides so a `../../../etc/passwd` cannot read arbitrary disk.
fn validate_local_image(path: &str, folder: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err(format!("Not a file: {path}"));
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Refusing to operate on non-image file".into());
    }
    let canon_path = p.canonicalize().map_err(|e| format!("Canonicalize path: {e}"))?;
    let canon_folder = PathBuf::from(folder)
        .canonicalize()
        .map_err(|e| format!("Canonicalize folder: {e}"))?;
    if !canon_path.starts_with(&canon_folder) {
        return Err("Path is outside the configured image folder".into());
    }
    Ok(canon_path)
}

#[tauri::command]
pub fn read_local_image_data_url(path: String, folder: String) -> Result<String, String> {
    let p = validate_local_image(&path, &folder)?;
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    let mime = match ext.as_str() {
        "png" | "apng" => "image/png",
        "jpg" | "jpeg" | "jfif" | "pjpeg" | "pjp" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "avif" => "image/avif",
        "heic" | "heif" => "image/heic",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    };
    use base64::Engine as _;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[tauri::command]
pub fn delete_local_image(path: String, folder: String) -> Result<(), String> {
    let p = validate_local_image(&path, &folder)?;
    std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    Ok(())
}
