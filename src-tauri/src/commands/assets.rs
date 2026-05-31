//! Managed local asset storage for church branding + a persistent image
//! library. Brand assets live in `<app-data>/com.manna.app/brand/`, the
//! uploaded image library in `<app-data>/com.manna.app/images/`. All paths sit
//! under $APPDATA, which the asset-protocol scope already allows, so the
//! frontend loads them via `convertFileSrc`.

use std::path::{Path, PathBuf};

/// Allowed image extensions (lowercased, no dot). Mirrors `images.rs`.
const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "avif", "heic",
    "heif", "svg", "ico", "jfif", "apng",
];

fn app_root() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.manna.app")
}

fn brand_dir() -> PathBuf {
    app_root().join("brand")
}

fn library_dir() -> PathBuf {
    app_root().join("images")
}

fn ext_of(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default()
}

fn is_image(p: &Path) -> bool {
    IMAGE_EXTS.contains(&ext_of(p).as_str())
}

/// Copy a validated image `src` into `dest_dir` as `<file_name>`. Creates the
/// directory. Returns the destination absolute path as a String.
fn copy_image_into(src: &str, dest_dir: &Path, file_name: &str) -> Result<String, String> {
    let src_path = PathBuf::from(src);
    if !src_path.is_file() {
        return Err(format!("Not a file: {src}"));
    }
    if !is_image(&src_path) {
        return Err("Refusing to import a non-image file".into());
    }
    std::fs::create_dir_all(dest_dir)
        .map_err(|e| format!("Create dir {}: {e}", dest_dir.display()))?;
    let dest = dest_dir.join(file_name);
    std::fs::copy(&src_path, &dest)
        .map_err(|e| format!("Copy {src} -> {}: {e}", dest.display()))?;
    Ok(dest.to_string_lossy().into_owned())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrandKind {
    Logo,
    Momo,
    Jesus,
}

impl BrandKind {
    fn stem(&self) -> &'static str {
        match self {
            BrandKind::Logo => "logo",
            BrandKind::Momo => "momo",
            BrandKind::Jesus => "jesus",
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImage {
    pub path: String,
    pub label: String,
}

/// Copy a picked file into `brand/<kind>.<ext>`, returning the stored path.
/// Removes any prior brand file for this kind (any extension) first.
#[tauri::command]
pub fn save_brand_asset(kind: BrandKind, src_path: String) -> Result<String, String> {
    let ext = ext_of(&PathBuf::from(&src_path));
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Refusing to import a non-image file".into());
    }
    let dir = brand_dir();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.file_stem().and_then(|s| s.to_str()) == Some(kind.stem()) {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    copy_image_into(&src_path, &dir, &format!("{}.{ext}", kind.stem()))
}

/// Remove the brand file(s) for a kind. Idempotent.
#[tauri::command]
pub fn delete_brand_asset(kind: BrandKind) -> Result<(), String> {
    let dir = brand_dir();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.file_stem().and_then(|s| s.to_str()) == Some(kind.stem()) {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    Ok(())
}

/// Copy a picked file into the managed image library as `<uuid>.<ext>`.
#[tauri::command]
pub fn import_library_image(src_path: String) -> Result<String, String> {
    let ext = ext_of(&PathBuf::from(&src_path));
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Refusing to import a non-image file".into());
    }
    let name = format!("{}.{ext}", uuid::Uuid::new_v4());
    copy_image_into(&src_path, &library_dir(), &name)
}

/// List the managed image library (filename stem as label, absolute path).
#[tauri::command]
pub fn list_brand_library_images() -> Result<Vec<LibraryImage>, String> {
    let dir = library_dir();
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(e.to_string()),
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() && is_image(&p) {
            out.push(LibraryImage {
                label: p
                    .file_stem()
                    .and_then(|n| n.to_str())
                    .unwrap_or("image")
                    .to_string(),
                path: p.to_string_lossy().into_owned(),
            });
        }
    }
    out.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    Ok(out)
}

/// Delete a library image. Validates the path is inside the managed library
/// dir (canonicalized containment) before unlinking — no traversal.
#[tauri::command]
pub fn delete_brand_library_image(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let canon_target = target
        .canonicalize()
        .map_err(|e| format!("Canonicalize path: {e}"))?;
    let canon_dir = library_dir()
        .canonicalize()
        .map_err(|e| format!("Canonicalize library dir: {e}"))?;
    if !canon_target.starts_with(&canon_dir) {
        return Err("Refusing to delete a file outside the image library".into());
    }
    std::fs::remove_file(&canon_target).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_png(dir: &Path, name: &str) -> String {
        let p = dir.join(name);
        std::fs::write(&p, b"\x89PNG\r\n\x1a\n fake").unwrap();
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn copy_image_into_copies_and_rejects_non_image() {
        let dir = tempdir().unwrap();
        let src = write_png(dir.path(), "src.png");
        let dest_dir = dir.path().join("brand");
        let out = copy_image_into(&src, &dest_dir, "logo.png").unwrap();
        assert!(PathBuf::from(&out).is_file());

        let txt = dir.path().join("note.txt");
        std::fs::write(&txt, b"x").unwrap();
        assert!(copy_image_into(txt.to_str().unwrap(), &dest_dir, "logo.txt").is_err());
    }

    #[test]
    fn is_image_checks_extension() {
        assert!(is_image(Path::new("a.PNG")));
        assert!(is_image(Path::new("a.jpeg")));
        assert!(!is_image(Path::new("a.txt")));
        assert!(!is_image(Path::new("a")));
    }
}
