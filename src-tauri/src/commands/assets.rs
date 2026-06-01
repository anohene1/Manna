//! Managed local asset storage for church branding. Brand assets (logo, MoMo,
//! Jesus) live in `<app-data>/com.manna.app/brand/`, under $APPDATA which the
//! asset-protocol scope already allows, so the frontend loads them via
//! `convertFileSrc`.
//!
//! NOTE: the persistent *image library* (saved-from-online + disk uploads)
//! lives in `images.rs` (`library/images/` dir, `list_library_images`,
//! `save_image_to_library`, `import_library_image`). This module is brand-only
//! to avoid two competing libraries.

use std::path::{Path, PathBuf};

/// Allowed image extensions (lowercased, no dot). Mirrors `images.rs`.
const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "avif", "heic",
    "heif", "svg", "ico", "jfif", "apng",
];

fn brand_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.manna.app")
        .join("brand")
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
    Blank,
    Momo,
    Jesus,
}

impl BrandKind {
    fn stem(&self) -> &'static str {
        match self {
            BrandKind::Logo => "logo",
            BrandKind::Blank => "blank",
            BrandKind::Momo => "momo",
            BrandKind::Jesus => "jesus",
        }
    }
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
