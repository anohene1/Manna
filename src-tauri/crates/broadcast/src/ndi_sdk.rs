use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use libloading::Library;
use thiserror::Error;

type NdiInitializeFn = unsafe extern "C" fn() -> bool;

static NDI_SDK: OnceLock<Result<Arc<NdiSdk>, NdiSdkError>> = OnceLock::new();

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
    let candidates: &[&str] = if cfg!(target_os = "macos") {
        &["sdk/ndi/macos/libndi.dylib"]
    } else if cfg!(target_os = "windows") {
        &["sdk/ndi/windows/Processing.NDI.Lib.x64.dll"]
    } else {
        &[
            "sdk/ndi/linux/libndi.so",
            "sdk/ndi/linux/x86_64/libndi.so.6",
            "sdk/ndi/linux/libndi.so.6",
        ]
    };
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    candidates
        .iter()
        .map(|candidate| base.join(candidate))
        .find(|candidate| candidate.exists())
        .ok_or_else(|| NdiSdkError::LibraryNotFound(candidates.join(", ")))
}
