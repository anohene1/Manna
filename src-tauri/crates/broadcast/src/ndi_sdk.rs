use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use libloading::Library;
use thiserror::Error;

type NdiInitializeFn = unsafe extern "C" fn() -> bool;

static NDI_SDK: OnceLock<Result<Arc<NdiSdk>, NdiSdkError>> = OnceLock::new();
static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Error)]
pub enum NdiSdkConfigurationError {
    #[error("NDI resource directory was already configured")]
    AlreadyConfigured,
}

/// Sets the installed application's resource directory before the NDI SDK is loaded.
///
/// Development builds retain a repository-root fallback, but packaged builds
/// resolve the platform runtime from this directory.
///
/// # Errors
///
/// Returns [`NdiSdkConfigurationError::AlreadyConfigured`] if called more than once.
pub fn configure_resource_dir(resource_dir: PathBuf) -> Result<(), NdiSdkConfigurationError> {
    RESOURCE_DIR
        .set(resource_dir)
        .map_err(|_| NdiSdkConfigurationError::AlreadyConfigured)
}

/// Process-lifetime owner for the dynamically loaded NDI SDK.
///
/// NDI initialization and destruction are global operations. Keeping one
/// library owner alive for the process prevents a sender, receiver, or finder
/// from unloading or destroying the SDK while another session still uses it.
pub(crate) struct NdiSdk {
    library: Library,
}

#[derive(Debug, Clone, Error)]
pub(crate) enum NdiSdkError {
    #[error("unable to locate NDI library at {0}")]
    LibraryNotFound(String),
    #[error("failed to load NDI library: {0}")]
    LibraryLoad(String),
    #[error("failed to load NDI symbol {symbol}: {message}")]
    SymbolLoad {
        symbol: &'static str,
        message: String,
    },
    #[error("NDI initialization failed")]
    InitializeFailed,
}

impl NdiSdk {
    pub(crate) fn global() -> Result<Arc<Self>, NdiSdkError> {
        NDI_SDK.get_or_init(Self::load).clone()
    }

    fn load() -> Result<Arc<Self>, NdiSdkError> {
        let path = resolve_library_path()?;
        // SAFETY: the path is an existing bundled NDI dynamic library. The
        // returned Library is retained by the process-lifetime global owner.
        let library = unsafe { Library::new(path) }
            .map_err(|error| NdiSdkError::LibraryLoad(error.to_string()))?;
        // SAFETY: the symbol name and function signature match the NDI SDK.
        let initialize = unsafe {
            library
                .get::<NdiInitializeFn>(b"NDIlib_initialize\0")
                .map_err(|error| NdiSdkError::SymbolLoad {
                    symbol: "NDIlib_initialize",
                    message: error.to_string(),
                })?
        };
        // SAFETY: the loaded initialization function has no arguments and is
        // invoked once before any NDI handles are created.
        if !unsafe { initialize() } {
            return Err(NdiSdkError::InitializeFailed);
        }
        Ok(Arc::new(Self { library }))
    }

    pub(crate) fn symbol<T: Copy>(
        &self,
        symbol: &'static [u8],
        name: &'static str,
    ) -> Result<T, NdiSdkError> {
        // SAFETY: callers provide the exact exported NDI symbol type. The
        // process-lifetime SDK owner outlives every copied function pointer.
        let loaded =
            unsafe { self.library.get::<T>(symbol) }.map_err(|error| NdiSdkError::SymbolLoad {
                symbol: name,
                message: error.to_string(),
            })?;
        Ok(*loaded)
    }
}

fn resolve_library_path() -> Result<PathBuf, NdiSdkError> {
    let development_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let candidates =
        library_candidates(RESOURCE_DIR.get().map(PathBuf::as_path), &development_root);
    let attempted_paths = candidates
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .ok_or(NdiSdkError::LibraryNotFound(attempted_paths))
}

fn platform_library_paths() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["sdk/ndi/macos/libndi.dylib"]
    } else if cfg!(target_os = "windows") {
        &["sdk/ndi/windows/Processing.NDI.Lib.x64.dll"]
    } else {
        &[
            "sdk/ndi/linux/libndi.so",
            "sdk/ndi/linux/x86_64/libndi.so.6",
            "sdk/ndi/linux/libndi.so.6",
        ]
    }
}

fn library_candidates(resource_dir: Option<&Path>, development_root: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(root) = resource_dir {
        #[cfg(target_os = "macos")]
        if let Some(contents_dir) = root.parent() {
            candidates.push(contents_dir.join("Frameworks/libndi.dylib"));
        }

        candidates.extend(
            platform_library_paths()
                .iter()
                .map(|relative_path| root.join(relative_path)),
        );
    }

    candidates.extend(
        platform_library_paths()
            .iter()
            .map(|relative_path| development_root.join(relative_path)),
    );
    candidates
}

#[cfg(test)]
mod tests {
    use super::{library_candidates, platform_library_paths};
    use std::path::Path;

    #[test]
    fn packaged_resource_candidate_should_precede_development_fallback() {
        let resource_dir = Path::new("/installed/resources");
        let development_root = Path::new("/workspace");
        let candidates = library_candidates(Some(resource_dir), development_root);
        let packaged_offset = usize::from(cfg!(target_os = "macos"));

        #[cfg(target_os = "macos")]
        assert_eq!(
            candidates[0],
            Path::new("/installed/Frameworks/libndi.dylib")
        );

        for (index, relative_path) in platform_library_paths().iter().enumerate() {
            assert_eq!(
                candidates[packaged_offset + index],
                resource_dir.join(relative_path)
            );
            assert_eq!(
                candidates[packaged_offset + platform_library_paths().len() + index],
                development_root.join(relative_path)
            );
        }
    }

    #[test]
    fn development_candidate_should_remain_available_without_resource_directory() {
        let development_root = Path::new("/workspace");
        let candidates = library_candidates(None, development_root);

        assert_eq!(
            candidates[0],
            development_root.join(Path::new(platform_library_paths()[0]))
        );
    }
}
