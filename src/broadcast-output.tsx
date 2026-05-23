import { createRoot } from "react-dom/client"
import { useRef, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { renderVerse } from "@/lib/verse-renderer"
import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"
import type { NdiConfigEventPayload, NdiFrameRequest } from "@/types"

/** Convert Uint8Array/Uint8ClampedArray to base64 using Function.apply (avoids spread stack overflow) */
function uint8ToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  const CHUNK = 0x8000 // 32KB — safe for Function.apply
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(
      String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + CHUNK) as unknown as number[],
      ),
    )
  }
  return btoa(parts.join(""))
}

/** Read output ID from URL query param (?output=main or ?output=alt). Defaults to "main". */
const OUTPUT_ID = new URLSearchParams(window.location.search).get("output") ?? "main"

function drawAnnouncement(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  announcement: { text: string; position: "top" | "bottom"; style: "info" | "urgent" } | null,
) {
  if (!announcement) return

  const bandHeight = Math.round(height * 0.12)
  const y = announcement.position === "top" ? 0 : height - bandHeight
  const bg = announcement.style === "urgent" ? "rgba(220, 38, 38, 0.92)" : "rgba(15, 23, 42, 0.85)"
  const fg = "#ffffff"

  ctx.fillStyle = bg
  ctx.fillRect(0, y, width, bandHeight)

  const fontSize = Math.round(bandHeight * 0.4)
  ctx.fillStyle = fg
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(announcement.text, width / 2, y + bandHeight / 2, width - 80)
}

interface BroadcastPayload {
  theme: BroadcastTheme
  verse: VerseRenderData | null
  blankLogo?: boolean
  fullscreenImage?: { url: string; label: string } | null
}

const BLANK_LOGO_URL = "/EWC-White.png"

interface AnnouncementPayload {
  text: string
  position: "top" | "bottom"
  style: "info" | "urgent"
  duration: number | null
}

function BroadcastCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestData = useRef<BroadcastPayload | null>(null)
  const announcementRef = useRef<AnnouncementPayload | null>(null)
  const announcementTimerRef = useRef<number | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const ndiConfigRef = useRef<NdiConfigEventPayload>({
    active: false,
    fps: 24,
    width: 1920,
    height: 1080,
  })
  const ndiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastPushRef = useRef(0)
  const pushingRef = useRef(false)

  const logDebug = useCallback((message: string, meta?: unknown) => {
    if (!import.meta.env.DEV) return
    if (meta === undefined) {
      console.debug(`[broadcast-output] ${message}`)
      return
    }
    console.debug(`[broadcast-output] ${message}`, meta)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const data = latestData.current
    if (!data) {
      // Black screen when no data
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }

    const { theme, verse, blankLogo, fullscreenImage } = data
    canvas.width = theme.resolution.width
    canvas.height = theme.resolution.height

    if (fullscreenImage) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const img = imageCacheRef.current.get(fullscreenImage.url)
      if (img && img.complete && img.naturalWidth > 0) {
        const imgAspect = img.naturalWidth / img.naturalHeight
        const canvasAspect = canvas.width / canvas.height
        let w = canvas.width
        let h = canvas.height
        if (imgAspect > canvasAspect) {
          h = canvas.width / imgAspect
        } else {
          w = canvas.height * imgAspect
        }
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
      }
      drawAnnouncement(ctx, canvas.width, canvas.height, announcementRef.current)
      return
    }

    if (blankLogo) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const img = imageCacheRef.current.get(BLANK_LOGO_URL)
      if (img && img.complete && img.naturalWidth > 0) {
        const target = Math.min(canvas.width, canvas.height) * 0.99
        const aspect = img.naturalWidth / img.naturalHeight
        const logoW = aspect >= 1 ? target : target * aspect
        const logoH = aspect >= 1 ? target / aspect : target
        ctx.drawImage(img, (canvas.width - logoW) / 2, (canvas.height - logoH) / 2, logoW, logoH)
      }
      drawAnnouncement(ctx, canvas.width, canvas.height, announcementRef.current)
      return
    }

    const result = renderVerse(ctx, theme, verse, {
      scale: 1,
      imageCache: imageCacheRef.current,
    })
    if (!result) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      logDebug("renderVerse returned null; drew fallback frame")
    }

    drawAnnouncement(ctx, canvas.width, canvas.height, announcementRef.current)
  }, [logDebug])

  const preloadImage = useCallback((url: string, label: string) => {
    const cache = imageCacheRef.current
    if (cache.has(url)) return
    const img = new Image()
    img.onload = () => {
      cache.set(url, img)
      logDebug(`${label} loaded`, { url })
      draw()
    }
    img.onerror = () => {
      console.warn(`[broadcast-output] failed to load ${label}`, { url })
    }
    img.src = url
  }, [draw, logDebug])

  const preloadBackgroundImage = useCallback((theme: BroadcastTheme) => {
    const bg = theme.background
    if (bg.type === "image" && bg.image?.url) preloadImage(bg.image.url, "Background image")
    if (theme.logo?.url) preloadImage(theme.logo.url, "Logo")
  }, [preloadImage])

  const pushNdiFrame = useCallback(async () => {
    if (!ndiConfigRef.current.active) return
    if (pushingRef.current) return // back-pressure: skip if already pushing
    pushingRef.current = true

    try {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const targetWidth = ndiConfigRef.current.width
      const targetHeight = ndiConfigRef.current.height

      let sourceCtx = ctx
      let sourceWidth = canvas.width
      let sourceHeight = canvas.height

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        const ndiCanvas = ndiCanvasRef.current ?? document.createElement("canvas")
        ndiCanvas.width = targetWidth
        ndiCanvas.height = targetHeight
        const ndiCtx = ndiCanvas.getContext("2d")
        if (!ndiCtx) return
        ndiCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
        ndiCanvasRef.current = ndiCanvas
        sourceCtx = ndiCtx
        sourceWidth = targetWidth
        sourceHeight = targetHeight
      }

      const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight)
      const rgbaBase64 = uint8ToBase64(imageData.data)

      const request: NdiFrameRequest = {
        outputId: OUTPUT_ID,
        width: sourceWidth,
        height: sourceHeight,
        rgbaBase64,
      }

      await invoke("push_ndi_frame", { request })
      lastPushRef.current = Date.now()
    } catch (error) {
      console.warn("[broadcast-output] push_ndi_frame failed", error)
    } finally {
      pushingRef.current = false
    }
  }, [])

  /** Push a burst of 3 frames after content changes (NDI receivers need a few frames to sync) */
  const pushNdiBurst = useCallback(() => {
    void pushNdiFrame()
    setTimeout(() => void pushNdiFrame(), 150)
    setTimeout(() => void pushNdiFrame(), 300)
  }, [pushNdiFrame])

  useEffect(() => {
    // Set initial canvas size
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 1920
      canvas.height = 1080
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, 1920, 1080)
      }
    }

    const currentWindow = getCurrentWebviewWindow()
    logDebug("Listener registration started", { label: currentWindow.label })
    const unlisten = currentWindow.listen<BroadcastPayload>(`broadcast:verse-update:${OUTPUT_ID}`, (event) => {
      latestData.current = event.payload
      preloadBackgroundImage(event.payload.theme)
      if (event.payload.blankLogo) preloadImage(BLANK_LOGO_URL, "Blank logo")
      if (event.payload.fullscreenImage?.url) preloadImage(event.payload.fullscreenImage.url, "Fullscreen image")
      logDebug("Received broadcast:verse-update", {
        hasVerse: Boolean(event.payload.verse),
        blankLogo: Boolean(event.payload.blankLogo),
        themeId: event.payload.theme.id,
      })
      draw()
      pushNdiBurst()
    })

    const unlistenAnnouncement = currentWindow.listen<AnnouncementPayload | null>(`broadcast:announcement:${OUTPUT_ID}`, (event) => {
      announcementRef.current = event.payload
      if (announcementTimerRef.current !== null) {
        clearTimeout(announcementTimerRef.current)
        announcementTimerRef.current = null
      }
      if (event.payload && event.payload.duration) {
        announcementTimerRef.current = window.setTimeout(() => {
          announcementRef.current = null
          announcementTimerRef.current = null
          draw()
          pushNdiBurst()
        }, event.payload.duration * 1000)
      }
      logDebug("Received broadcast:announcement", event.payload)
      draw()
      pushNdiBurst()
    })

    const unlistenNdiConfig = currentWindow.listen<NdiConfigEventPayload>(`broadcast:ndi-config:${OUTPUT_ID}`, (event) => {
      ndiConfigRef.current = event.payload
      logDebug("Received broadcast:ndi-config", event.payload)
      // Push burst when NDI becomes active
      if (event.payload.active) pushNdiBurst()
    })

    // Request current NDI status on mount (fixes race condition
    // where NDI is started before this window opens)
    void invoke<{ active: boolean; width: number; height: number; fps: number } | null>("get_ndi_status", { outputId: OUTPUT_ID })
      .then((status) => {
        if (status && status.active) {
          ndiConfigRef.current = {
            active: true,
            fps: status.fps,
            width: status.width,
            height: status.height,
          }
          logDebug("Fetched NDI status on mount", status)
        }
      })
      .catch(() => {
        // Command may not exist yet
      })

    void currentWindow.emitTo("main", "broadcast:output-ready").then(() => {
      logDebug("Sent broadcast:output-ready")
    }).catch(() => {
      console.warn("[broadcast-output] failed to send output-ready event")
    })

    return () => {
      unlisten.then((fn) => fn())
      unlistenAnnouncement.then((fn) => fn())
      unlistenNdiConfig.then((fn) => fn())
      if (announcementTimerRef.current !== null) {
        clearTimeout(announcementTimerRef.current)
      }
    }
  }, [draw, logDebug, preloadBackgroundImage, pushNdiFrame, pushNdiBurst])

  // Slow keepalive: push one frame every 2s if idle (prevents NDI receivers from dropping the source)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!ndiConfigRef.current.active) return
      const elapsed = Date.now() - lastPushRef.current
      if (elapsed > 2000) void pushNdiFrame()
    }, 2000)
    return () => clearInterval(timer)
  }, [pushNdiFrame])

  // Fullscreen: F / F11 toggles, Esc exits. Also double-click on canvas.
  useEffect(() => {
    const win = getCurrentWebviewWindow()
    const toggle = async () => {
      try {
        const isFs = await win.isFullscreen()
        await win.setFullscreen(!isFs)
      } catch (e) {
        console.warn("[broadcast] fullscreen toggle failed", e)
      }
    }
    const exit = async () => {
      try {
        if (await win.isFullscreen()) await win.setFullscreen(false)
      } catch (e) {
        console.warn("[broadcast] fullscreen exit failed", e)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F" || e.key === "F11") {
        e.preventDefault()
        void toggle()
      } else if (e.key === "Escape") {
        void exit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const handleDoubleClick = useCallback(async () => {
    const win = getCurrentWebviewWindow()
    try {
      const isFs = await win.isFullscreen()
      await win.setFullscreen(!isFs)
    } catch (e) {
      console.warn("[broadcast] fullscreen toggle failed", e)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onDoubleClick={handleDoubleClick}
      style={{
        width: "100vw",
        height: "100vh",
        display: "block",
        objectFit: "contain",
      }}
    />
  )
}

const root = document.getElementById("broadcast-root")!
createRoot(root).render(<BroadcastCanvas />)
