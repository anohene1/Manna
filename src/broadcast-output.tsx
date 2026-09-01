import { createRoot } from "react-dom/client"
import { useRef, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { listen } from "@tauri-apps/api/event"
import {
  insetsToTransform,
  IDENTITY_INSETS,
  type CalibrationInsets,
} from "@/lib/projector-calibration"
import { drawThemeLogo, renderVerse } from "@/lib/verse-renderer"
import { renderNotes } from "@/lib/notes-renderer"
import {
  openLocalVideoStream,
  playVideoWithAbortRetry,
  stopMediaStream,
} from "@/lib/camera-input"
import {
  liftLowerThirdAboveTicker,
  overlayMotionFrame,
  tickerMessageX,
} from "@/lib/broadcast-composition"
import { getHtmlLowerThirdImage } from "@/lib/html-lower-third"
import type {
  BroadcastTheme,
  VerseRenderData,
  NotesSlide,
} from "@/types/broadcast"
import type { CameraBroadcastConfig, NdiInputStatus } from "@/types"
import type { NdiConfigEventPayload } from "@/types"

/** Read output ID from URL query param (?output=main or ?output=alt). Defaults to "main". */
const OUTPUT_ID =
  new URLSearchParams(window.location.search).get("output") ?? "main"

/** Upper bound on supersampling. 4x of a 1080p design space is 8K — beyond
 * any real projector, and the memory/CPU cost of getImageData for NDI grows
 * with the square of this. */
const MAX_RENDER_SCALE = 4

/**
 * How many device pixels to rasterize per design-space pixel.
 *
 * The canvas is laid out in the theme's design space (usually 1920x1080) but
 * displayed at `100vw/100vh`. On a 4K projector that means a 1080p buffer is
 * upscaled 2x by the compositor, which visibly softens text and rules.
 * Backing the canvas with the display's true pixel count instead — and
 * scaling the drawing context to match — keeps every layout calculation
 * identical while rasterizing type at native resolution.
 */
function computeRenderScale(designWidth: number): number {
  const cssWidth = window.innerWidth
  if (!cssWidth || !Number.isFinite(cssWidth)) return 1
  const dpr = window.devicePixelRatio || 1
  const devicePixelWidth = cssWidth * dpr
  const scale = devicePixelWidth / designWidth
  // Never render below the design resolution — downscaling would lose detail
  // the theme explicitly asked for.
  return Math.min(Math.max(scale, 1), MAX_RENDER_SCALE)
}

function drawTickerAnnouncement(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  scrollOffset: number
) {
  const bandHeight = Math.round(height * 0.085)
  const y = height - bandHeight

  // Translucent dark band — current slide content still visible above.
  ctx.fillStyle = "rgba(10, 12, 16, 0.82)"
  ctx.fillRect(0, y, width, bandHeight)

  // Subtle top border highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)"
  ctx.fillRect(0, y, width, 1)

  const fontSize = Math.round(bandHeight * 0.46)
  ctx.font = `500 ${fontSize}px "Inter Variable", system-ui, sans-serif`
  ctx.fillStyle = "#ffffff"
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"

  // A message always travels completely off the left edge before it restarts
  // at the right edge, including when it is shorter than the output width.
  const textWidth = ctx.measureText(text).width
  const gap = Math.round(width * 0.1)
  const x = tickerMessageX(width, textWidth, scrollOffset, gap)
  ctx.fillText(text, x, y + bandHeight / 2)
}

function drawCalibrationOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  insets: { top: number; right: number; bottom: number; left: number }
) {
  const x = insets.left * width
  const y = insets.top * height
  const w = width * (1 - insets.left - insets.right)
  const h = height * (1 - insets.top - insets.bottom)

  ctx.save()
  ctx.fillStyle = "rgba(0,0,0,0.45)"
  ctx.fillRect(0, 0, width, y)
  ctx.fillRect(0, y + h, width, height - (y + h))
  ctx.fillRect(0, y, x, h)
  ctx.fillRect(x + w, y, width - (x + w), h)

  ctx.strokeStyle = "#22d3ee"
  ctx.lineWidth = Math.max(2, width * 0.002)
  ctx.strokeRect(x, y, w, h)

  ctx.strokeStyle = "rgba(34,211,238,0.35)"
  ctx.lineWidth = Math.max(1, width * 0.001)
  for (let i = 1; i < 3; i++) {
    const gx = x + (w * i) / 3
    ctx.beginPath()
    ctx.moveTo(gx, y)
    ctx.lineTo(gx, y + h)
    ctx.stroke()
    const gy = y + (h * i) / 3
    ctx.beginPath()
    ctx.moveTo(x, gy)
    ctx.lineTo(x + w, gy)
    ctx.stroke()
  }

  const m = Math.min(w, h) * 0.06
  ctx.strokeStyle = "#22d3ee"
  ctx.lineWidth = Math.max(2, width * 0.003)
  const corners: Array<[number, number, number, number]> = [
    [x, y, m, m],
    [x + w, y, -m, m],
    [x, y + h, m, -m],
    [x + w, y + h, -m, -m],
  ]
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(cx + dx, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + dy)
    ctx.stroke()
  }

  const ccx = x + w / 2
  const ccy = y + h / 2
  const cross = Math.min(w, h) * 0.04
  ctx.beginPath()
  ctx.moveTo(ccx - cross, ccy)
  ctx.lineTo(ccx + cross, ccy)
  ctx.moveTo(ccx, ccy - cross)
  ctx.lineTo(ccx, ccy + cross)
  ctx.stroke()
  ctx.restore()
}

function drawSlideAnnouncement(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string
) {
  // Fully opaque background — takes over current slide content.
  ctx.fillStyle = "#000000"
  ctx.fillRect(0, 0, width, height)

  const padX = Math.round(width * 0.08)
  const maxWidth = width - padX * 2
  const baseSize = Math.round(height * 0.085)

  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"

  // Wrap text into lines; shrink font if too tall.
  let fontSize = baseSize
  let lines = wrapAnnouncement(ctx, text, maxWidth, fontSize)
  let lineHeight = Math.round(fontSize * 1.25)
  while (lines.length * lineHeight > height * 0.7 && fontSize > 24) {
    fontSize = Math.round(fontSize * 0.92)
    lines = wrapAnnouncement(ctx, text, maxWidth, fontSize)
    lineHeight = Math.round(fontSize * 1.25)
  }

  const blockHeight = lines.length * lineHeight
  let y = Math.round((height - blockHeight) / 2 + fontSize)
  for (const line of lines) {
    ctx.fillText(line, padX, y, maxWidth)
    y += lineHeight
  }
}

function wrapAnnouncement(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number
): string[] {
  ctx.font = `600 ${fontSize}px "Inter Variable", system-ui, sans-serif`
  const out: string[] = []
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ""
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) out.push(line)
  }
  return out
}

interface BroadcastPayload {
  theme: BroadcastTheme
  verse: VerseRenderData | null
  blankLogo?: boolean
  blankLogoUrl?: string
  fullscreenImage?: { url: string; label: string } | null
  notes?: NotesSlide | null
  camera?: CameraBroadcastConfig
}

const BLANK_LOGO_URL = "/ag-bebu.png"
const NDI_FRAME_HEADER_BYTES = 20

function parseNdiFramePacket(value: ArrayBuffer | Uint8Array): {
  sequence: number
  jpeg: Uint8Array
} | null {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  if (bytes.byteLength < NDI_FRAME_HEADER_BYTES) return null
  if (
    bytes[0] !== 0x4d ||
    bytes[1] !== 0x4e ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46
  ) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const sequence = Number(view.getBigUint64(4, true))
  return { sequence, jpeg: bytes.slice(NDI_FRAME_HEADER_BYTES) }
}

interface AnnouncementPayload {
  text: string
  mode: "ticker" | "slide"
  duration: number | null
  paused?: boolean
}

interface ActiveVerseMotion {
  phase: "enter" | "exit"
  startedAt: number
  verse: VerseRenderData
  theme: BroadcastTheme
  camera: boolean
  htmlImage: HTMLImageElement | null
}

function verseIdentity(verse: VerseRenderData | null | undefined): string {
  if (!verse) return ""
  return JSON.stringify([
    verse.contentType ?? "scripture",
    verse.reference,
    verse.segments,
  ])
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
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const ndiBitmapRef = useRef<ImageBitmap | null>(null)
  const cameraSourceKeyRef = useRef<string | null>(null)
  const ndiPollTimerRef = useRef<number | null>(null)
  const ndiPullingRef = useRef(false)
  const ndiSequenceRef = useRef(0)
  const ndiStatusPollRef = useRef(0)
  const programPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastProgramPreviewRef = useRef(0)
  const videoResumePendingRef = useRef(false)
  const htmlLowerThirdRef = useRef<HTMLImageElement | null>(null)
  const htmlLowerThirdGenerationRef = useRef(0)
  const verseMotionRef = useRef<ActiveVerseMotion | null>(null)
  const verseMotionRafRef = useRef<number | null>(null)

  const logDebug = useCallback((message: string, meta?: unknown) => {
    if (!import.meta.env.DEV) return
    if (meta === undefined) {
      console.debug(`[broadcast-output] ${message}`)
      return
    }
    console.debug(`[broadcast-output] ${message}`, meta)
  }, [])

  const tickerOffsetRef = useRef(0)
  const tickerRafRef = useRef<number | null>(null)

  const calibrationRef = useRef<CalibrationInsets>(IDENTITY_INSETS)
  const calibrationEditingRef = useRef(false)

  const drawVideoSource = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number,
      width: number,
      height: number,
      fit: "cover" | "contain",
      mirrored: boolean
    ) => {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, width, height)
      if (sourceWidth <= 0 || sourceHeight <= 0) return
      const sourceRatio = sourceWidth / sourceHeight
      const targetRatio = width / height
      let drawWidth: number
      let drawHeight: number
      if (fit === "cover") {
        if (sourceRatio > targetRatio) {
          drawHeight = height
          drawWidth = height * sourceRatio
        } else {
          drawWidth = width
          drawHeight = width / sourceRatio
        }
      } else if (sourceRatio > targetRatio) {
        drawWidth = width
        drawHeight = width / sourceRatio
      } else {
        drawWidth = height * sourceRatio
        drawHeight = height
      }
      const x = (width - drawWidth) / 2
      const y = (height - drawHeight) / 2
      ctx.save()
      if (mirrored) {
        ctx.translate(width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(source, width - x - drawWidth, y, drawWidth, drawHeight)
      } else {
        ctx.drawImage(source, x, y, drawWidth, drawHeight)
      }
      ctx.restore()
    },
    []
  )

  /** Paint the current `data + announcement` frame onto an arbitrary ctx. */
  const renderFrame = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const data = latestData.current
      if (!data) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        return
      }
      const {
        theme,
        verse,
        blankLogo,
        blankLogoUrl,
        fullscreenImage,
        notes,
        camera,
      } = data
      const logoUrl = blankLogoUrl || BLANK_LOGO_URL
      const announcement = announcementRef.current
      let motion = verseMotionRef.current
      if (motion) {
        const frame = overlayMotionFrame(
          motion.phase,
          motion.startedAt,
          performance.now()
        )
        if (frame.complete) {
          verseMotionRef.current = null
          motion = null
        }
      }

      if (announcement && announcement.mode === "slide") {
        drawSlideAnnouncement(ctx, width, height, announcement.text)
        return
      }

      if (fullscreenImage) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        const img = imageCacheRef.current.get(fullscreenImage.url)
        if (img && img.complete && img.naturalWidth > 0) {
          const imgAspect = img.naturalWidth / img.naturalHeight
          const canvasAspect = width / height
          let w = width
          let h = height
          if (imgAspect > canvasAspect) h = width / imgAspect
          else w = height * imgAspect
          ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h)
        }
        if (announcement && announcement.mode === "ticker") {
          drawTickerAnnouncement(
            ctx,
            width,
            height,
            announcement.text,
            tickerOffsetRef.current
          )
        }
        return
      }

      if (notes) {
        renderNotes(ctx, theme, notes, width, height)
        if (announcement && announcement.mode === "ticker") {
          drawTickerAnnouncement(
            ctx,
            width,
            height,
            announcement.text,
            tickerOffsetRef.current
          )
        }
        return
      }

      if (blankLogo) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        const img = imageCacheRef.current.get(logoUrl)
        if (img && img.complete && img.naturalWidth > 0) {
          const target = Math.min(width, height) * 0.99
          const aspect = img.naturalWidth / img.naturalHeight
          const logoW = aspect >= 1 ? target : target * aspect
          const logoH = aspect >= 1 ? target / aspect : target
          ctx.drawImage(
            img,
            (width - logoW) / 2,
            (height - logoH) / 2,
            logoW,
            logoH
          )
        }
        if (announcement && announcement.mode === "ticker") {
          drawTickerAnnouncement(
            ctx,
            width,
            height,
            announcement.text,
            tickerOffsetRef.current
          )
        }
        return
      }

      if (camera?.active) {
        const video = cameraVideoRef.current
        const bitmap = ndiBitmapRef.current
        if (
          camera.source?.type === "local" &&
          video &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          drawVideoSource(
            ctx,
            video,
            video.videoWidth,
            video.videoHeight,
            width,
            height,
            camera.fit,
            camera.mirrored
          )
        } else if (camera.source?.type === "ndi" && bitmap) {
          drawVideoSource(
            ctx,
            bitmap,
            bitmap.width,
            bitmap.height,
            width,
            height,
            camera.fit,
            camera.mirrored
          )
        } else {
          ctx.fillStyle = "#000"
          ctx.fillRect(0, 0, width, height)
        }
        const cameraMotion = motion?.camera ? motion : null
        const motionStyle = cameraMotion
          ? overlayMotionFrame(
              cameraMotion.phase,
              cameraMotion.startedAt,
              performance.now()
            )
          : null
        const overlayTheme = cameraMotion?.theme ?? camera.lowerThirdTheme
        const overlayVerse = cameraMotion?.verse ?? verse
        ctx.save()
        if (motionStyle) {
          ctx.globalAlpha = motionStyle.opacity
          ctx.translate(0, motionStyle.offsetY)
        }
        if (overlayTheme.htmlTemplate) {
          const overlay =
            cameraMotion?.phase === "exit"
              ? cameraMotion.htmlImage
              : htmlLowerThirdRef.current
          if (overlay) ctx.drawImage(overlay, 0, 0, width, height)
        } else {
          const lowerThirdTheme =
            announcement?.mode === "ticker"
              ? liftLowerThirdAboveTicker(overlayTheme, height)
              : overlayTheme
          renderVerse(ctx, { ...lowerThirdTheme, logo: null }, overlayVerse, {
            scale: 1,
            imageCache: imageCacheRef.current,
            skipBackground: true,
            opacity: motionStyle?.opacity,
          })
        }
        ctx.restore()
        // Branding is a persistent program layer, not part of the verse motion.
        drawThemeLogo(ctx, camera.lowerThirdTheme, 1, imageCacheRef.current)
        if (announcement && announcement.mode === "ticker") {
          drawTickerAnnouncement(
            ctx,
            width,
            height,
            announcement.text,
            tickerOffsetRef.current
          )
        }
        return
      }

      const slideMotion = motion && !motion.camera ? motion : null
      let result
      if (slideMotion) {
        // Keep the slide surface and logo steady while only its verse layer
        // moves, avoiding a full-screen flash on every reference change.
        renderVerse(
          ctx,
          {
            ...theme,
            textBox: { ...theme.textBox, enabled: false },
          },
          null,
          { scale: 1, imageCache: imageCacheRef.current }
        )
        const motionStyle = overlayMotionFrame(
          slideMotion.phase,
          slideMotion.startedAt,
          performance.now()
        )
        ctx.save()
        ctx.translate(0, motionStyle.offsetY)
        result = renderVerse(
          ctx,
          { ...slideMotion.theme, logo: null },
          slideMotion.verse,
          {
            scale: 1,
            imageCache: imageCacheRef.current,
            skipBackground: true,
            opacity: motionStyle.opacity,
          }
        )
        ctx.restore()
      } else {
        result = renderVerse(ctx, theme, verse, {
          scale: 1,
          imageCache: imageCacheRef.current,
        })
      }
      if (!result) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        logDebug("renderVerse returned null; drew fallback frame")
      }
      if (announcement && announcement.mode === "ticker") {
        drawTickerAnnouncement(
          ctx,
          width,
          height,
          announcement.text,
          tickerOffsetRef.current
        )
      }
    },
    [drawVideoSource, logDebug]
  )

  const applyCalibrationTransform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fw = canvas.width || 1920
    const fh = canvas.height || 1080
    const t = insetsToTransform(calibrationRef.current, fw, fh)
    const fx = (t.offsetX / fw) * 100
    const fy = (t.offsetY / fh) * 100
    canvas.style.transformOrigin = "0 0"
    canvas.style.transform = `translate(${fx}%, ${fy}%) scale(${t.scale})`
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const data = latestData.current

    // Design space. Every renderer lays out against these dimensions and some
    // (e.g. notes-renderer) clamp to absolute theme font sizes, so this must
    // stay the theme resolution — enlarging it would shrink text instead of
    // sharpening it.
    const designW = data?.theme.resolution.width ?? 1920
    const designH = data?.theme.resolution.height ?? 1080

    // Back the canvas with the projector's real pixel grid, then map design
    // space onto it. Layout is unchanged; only the rasterization gets finer.
    const renderScale = computeRenderScale(designW)
    const bufferW = Math.round(designW * renderScale)
    const bufferH = Math.round(designH * renderScale)
    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW
      canvas.height = bufferH
    }
    // Resizing a canvas resets its context state, so re-apply the transform
    // on every draw rather than only when the size changes.
    ctx.setTransform(bufferW / designW, 0, 0, bufferH / designH, 0, 0)

    renderFrame(ctx, designW, designH)
    if (calibrationEditingRef.current) {
      drawCalibrationOverlay(ctx, designW, designH, calibrationRef.current)
    }
    applyCalibrationTransform()
  }, [renderFrame, applyCalibrationTransform])

  const animateVerseMotion = useCallback(() => {
    if (verseMotionRafRef.current !== null) {
      cancelAnimationFrame(verseMotionRafRef.current)
    }
    const step = () => {
      const motion = verseMotionRef.current
      draw()
      if (
        motion &&
        !motion.camera &&
        performance.now() - motion.startedAt < 260
      ) {
        verseMotionRafRef.current = requestAnimationFrame(step)
      } else {
        verseMotionRafRef.current = null
        draw()
      }
    }
    verseMotionRafRef.current = requestAnimationFrame(step)
  }, [draw])

  const refreshHtmlLowerThird = useCallback(
    (data: BroadcastPayload | null = latestData.current) => {
      const generation = ++htmlLowerThirdGenerationRef.current
      htmlLowerThirdRef.current = null
      const camera = data?.camera
      if (!camera?.active || !camera.lowerThirdTheme.htmlTemplate) return
      const request = getHtmlLowerThirdImage(
        camera.lowerThirdTheme,
        data.verse,
        announcementRef.current?.mode === "ticker",
        { churchName: camera.churchName, logoUrl: camera.logoUrl }
      )
      if (!request) return
      void request
        .then((image) => {
          if (generation !== htmlLowerThirdGenerationRef.current) return
          htmlLowerThirdRef.current = image
          const motion = verseMotionRef.current
          if (
            motion?.phase === "enter" &&
            motion.camera &&
            motion.theme.id === camera.lowerThirdTheme.id
          ) {
            motion.startedAt = performance.now()
          }
          draw()
        })
        .catch((error) => {
          if (generation === htmlLowerThirdGenerationRef.current) {
            console.warn("[broadcast-output] HTML lower third failed", error)
          }
        })
    },
    [draw]
  )

  const emitCameraStatus = useCallback(
    (
      connection:
        "idle" | "connecting" | "connected" | "disconnected" | "error",
      error?: string | null
    ) => {
      void getCurrentWebviewWindow()
        .emitTo("main", "broadcast:camera-status:main", {
          connection,
          error: error ?? null,
        })
        .catch(() => {})
    },
    []
  )

  const stopCameraSource = useCallback(() => {
    stopMediaStream(cameraStreamRef.current)
    cameraStreamRef.current = null
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause()
      cameraVideoRef.current.srcObject = null
    }
    cameraVideoRef.current = null
    ndiBitmapRef.current?.close()
    ndiBitmapRef.current = null
    if (ndiPollTimerRef.current !== null) {
      window.clearInterval(ndiPollTimerRef.current)
      ndiPollTimerRef.current = null
    }
    ndiSequenceRef.current = 0
    ndiStatusPollRef.current = 0
    ndiPullingRef.current = false
    videoResumePendingRef.current = false
    cameraSourceKeyRef.current = null
  }, [])

  const startCameraSource = useCallback(
    async (camera: CameraBroadcastConfig) => {
      const source = camera.source
      if (!source) return
      const key =
        source.type === "local"
          ? `local:${source.deviceId}`
          : `ndi:${source.sourceName}:${source.urlAddress ?? ""}`
      if (cameraSourceKeyRef.current === key) return
      stopCameraSource()
      cameraSourceKeyRef.current = key
      if (OUTPUT_ID === "main") await invoke("stop_ndi_input").catch(() => {})
      if (cameraSourceKeyRef.current !== key) return
      emitCameraStatus("connecting")

      if (source.type === "local") {
        let openedStream: MediaStream | null = null
        try {
          openedStream = await openLocalVideoStream(
            navigator.mediaDevices,
            source.deviceId
          )
          if (cameraSourceKeyRef.current !== key) {
            stopMediaStream(openedStream)
            return
          }
          const video = document.createElement("video")
          video.muted = true
          video.playsInline = true
          video.autoplay = true
          video.srcObject = openedStream
          cameraStreamRef.current = openedStream
          cameraVideoRef.current = video
          const track = openedStream.getVideoTracks()[0]
          if (track) {
            track.onended = () => {
              if (cameraSourceKeyRef.current === key) {
                emitCameraStatus("disconnected", `${source.label} disconnected`)
              }
            }
            track.onmute = () => {
              if (cameraSourceKeyRef.current === key) {
                emitCameraStatus(
                  "disconnected",
                  `${source.label} signal paused`
                )
              }
            }
            track.onunmute = () => {
              if (cameraSourceKeyRef.current === key) {
                void playVideoWithAbortRetry(video).catch(() => {})
                emitCameraStatus("connected")
              }
            }
          }
          await playVideoWithAbortRetry(video)
          if (cameraSourceKeyRef.current !== key) return
          emitCameraStatus("connected")
        } catch (error) {
          if (cameraSourceKeyRef.current === key) {
            stopCameraSource()
            emitCameraStatus(
              "error",
              error instanceof Error ? error.message : String(error)
            )
          } else if (openedStream) {
            stopMediaStream(openedStream)
          }
        }
        return
      }

      try {
        await invoke<NdiInputStatus>("start_ndi_input", {
          sourceName: source.sourceName,
          urlAddress: source.urlAddress,
        })
        if (cameraSourceKeyRef.current !== key) return
        emitCameraStatus("connecting")
        ndiPollTimerRef.current = window.setInterval(() => {
          ndiStatusPollRef.current += 1
          if (ndiStatusPollRef.current % 30 === 0) {
            void invoke<NdiInputStatus>("get_ndi_input_status")
              .then((status) => {
                if (cameraSourceKeyRef.current !== key) return
                if (status.error) emitCameraStatus("disconnected", status.error)
                else if (status.connected) emitCameraStatus("connected")
              })
              .catch(() => {})
          }
          const afterSequence = ndiSequenceRef.current
          if (ndiPullingRef.current) return
          ndiPullingRef.current = true
          void invoke<ArrayBuffer | Uint8Array>("pull_ndi_frame", {
            afterSequence,
          })
            .then(async (response) => {
              const packet = parseNdiFramePacket(response)
              if (
                !packet ||
                packet.sequence <= ndiSequenceRef.current ||
                packet.jpeg.length === 0
              )
                return
              const bitmap = await createImageBitmap(
                new Blob([packet.jpeg], { type: "image/jpeg" })
              )
              if (cameraSourceKeyRef.current !== key) {
                bitmap.close()
                return
              }
              ndiBitmapRef.current?.close()
              ndiBitmapRef.current = bitmap
              ndiSequenceRef.current = packet.sequence
              emitCameraStatus("connected")
            })
            .catch((error) => {
              if (cameraSourceKeyRef.current === key) {
                emitCameraStatus("disconnected", String(error))
              }
            })
            .finally(() => {
              if (cameraSourceKeyRef.current === key) {
                ndiPullingRef.current = false
              }
            })
        }, 33)
      } catch (error) {
        if (cameraSourceKeyRef.current === key) {
          emitCameraStatus(
            "error",
            error instanceof Error ? error.message : String(error)
          )
        }
      }
    },
    [emitCameraStatus, stopCameraSource]
  )

  const emitProgramPreview = useCallback(() => {
    const now = performance.now()
    if (now - lastProgramPreviewRef.current < 200) return
    const source = canvasRef.current
    if (!source) return
    const preview =
      programPreviewCanvasRef.current ?? document.createElement("canvas")
    preview.width = 640
    preview.height = 360
    const ctx = preview.getContext("2d")
    if (!ctx) return
    ctx.drawImage(source, 0, 0, preview.width, preview.height)
    programPreviewCanvasRef.current = preview
    lastProgramPreviewRef.current = now
    const dataUrl = preview.toDataURL("image/jpeg", 0.68)
    void getCurrentWebviewWindow()
      .emitTo("main", "broadcast:program-preview:main", { dataUrl })
      .catch(() => {})
  }, [])

  // Drive the ticker animation. Re-renders only while a ticker is active so
  // we don't burn CPU during normal verse display.
  useEffect(() => {
    const loop = () => {
      const a = announcementRef.current
      if (a && a.mode === "ticker" && !latestData.current?.camera?.active) {
        if (!a.paused) tickerOffsetRef.current += 2
        draw()
        tickerRafRef.current = requestAnimationFrame(loop)
      } else {
        tickerRafRef.current = null
      }
    }
    const start = () => {
      if (tickerRafRef.current == null)
        tickerRafRef.current = requestAnimationFrame(loop)
    }
    const id = window.setInterval(() => {
      const a = announcementRef.current
      if (a && a.mode === "ticker") start()
    }, 250)
    return () => {
      window.clearInterval(id)
      if (tickerRafRef.current != null)
        cancelAnimationFrame(tickerRafRef.current)
      tickerRafRef.current = null
    }
  }, [draw])

  // Re-rasterize when the projector window is resized, goes fullscreen, or is
  // moved to a display with a different DPI — the backing-store resolution is
  // derived from both the CSS size and devicePixelRatio, so either changing
  // invalidates the current buffer.
  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [draw])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen<{ insets: CalibrationInsets; editing: boolean }>(
      "projector:calibration",
      (event) => {
        calibrationRef.current = event.payload.insets ?? IDENTITY_INSETS
        calibrationEditingRef.current = !!event.payload.editing
        applyCalibrationTransform()
        draw()
      }
    ).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [applyCalibrationTransform, draw])

  const preloadImage = useCallback(
    (url: string, label: string) => {
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
    },
    [draw, logDebug]
  )

  const preloadBackgroundImage = useCallback(
    (theme: BroadcastTheme) => {
      const bg = theme.background
      if (bg.type === "image" && bg.image?.url)
        preloadImage(bg.image.url, "Background image")
      if (theme.logo?.url) preloadImage(theme.logo.url, "Logo")
    },
    [preloadImage]
  )

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
        const ndiCanvas =
          ndiCanvasRef.current ?? document.createElement("canvas")
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
      // Header: output byte + little-endian width/height, followed by RGBA.
      const packet = new Uint8Array(9 + imageData.data.byteLength)
      const header = new DataView(packet.buffer)
      packet[0] = OUTPUT_ID === "alt" ? 1 : 0
      header.setUint32(1, sourceWidth, true)
      header.setUint32(5, sourceHeight, true)
      packet.set(imageData.data, 9)
      await invoke("push_ndi_frame_binary", packet)
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
    const timer = window.setInterval(() => {
      const camera = latestData.current?.camera
      if (!camera?.active) return
      const video = cameraVideoRef.current
      if (
        camera.source?.type === "local" &&
        video?.paused &&
        !videoResumePendingRef.current
      ) {
        videoResumePendingRef.current = true
        void playVideoWithAbortRetry(video)
          .then(() => emitCameraStatus("connected"))
          .catch((error) => {
            emitCameraStatus(
              "disconnected",
              error instanceof Error ? error.message : String(error)
            )
          })
          .finally(() => {
            videoResumePendingRef.current = false
          })
      }
      const announcement = announcementRef.current
      if (announcement?.mode === "ticker" && !announcement.paused) {
        tickerOffsetRef.current += 2
      }
      draw()
      emitProgramPreview()
      void pushNdiFrame()
    }, 1000 / 30)
    return () => {
      window.clearInterval(timer)
      stopCameraSource()
      if (OUTPUT_ID === "main") void invoke("stop_ndi_input").catch(() => {})
    }
  }, [
    draw,
    emitCameraStatus,
    emitProgramPreview,
    pushNdiFrame,
    stopCameraSource,
  ])

  useEffect(() => {
    // Paint the initial frame through draw() rather than hardcoding a
    // 1920x1080 buffer. draw() sizes the backing store to the display's real
    // pixel grid, so the first frame is already sharp on a 4K projector —
    // otherwise the canvas would sit at 1080p until the first slide arrives.
    draw()

    const currentWindow = getCurrentWebviewWindow()
    logDebug("Listener registration started", { label: currentWindow.label })
    const unlisten = currentWindow.listen<BroadcastPayload>(
      `broadcast:verse-update:${OUTPUT_ID}`,
      (event) => {
        const previous = latestData.current
        const previousIdentity = verseIdentity(previous?.verse)
        const nextIdentity = verseIdentity(event.payload.verse)
        if (previousIdentity !== nextIdentity) {
          const entering = Boolean(event.payload.verse)
          const motionSource = entering ? event.payload : previous
          const motionVerse = entering
            ? event.payload.verse
            : (previous?.verse ?? null)
          const motionCamera = Boolean(
            entering
              ? event.payload.camera?.active
              : previous?.camera?.active && event.payload.camera?.active
          )
          if (motionSource && motionVerse) {
            verseMotionRef.current = {
              phase: entering ? "enter" : "exit",
              startedAt: performance.now(),
              verse: motionVerse,
              theme:
                motionSource.camera?.active && motionCamera
                  ? motionSource.camera.lowerThirdTheme
                  : motionSource.theme,
              camera: motionCamera,
              htmlImage: entering ? null : htmlLowerThirdRef.current,
            }
            if (!motionCamera) animateVerseMotion()
          }
        }
        latestData.current = event.payload
        refreshHtmlLowerThird(event.payload)
        preloadBackgroundImage(event.payload.theme)
        if (event.payload.blankLogo) {
          preloadImage(
            event.payload.blankLogoUrl || BLANK_LOGO_URL,
            "Blank logo"
          )
        }
        if (event.payload.fullscreenImage?.url)
          preloadImage(event.payload.fullscreenImage.url, "Fullscreen image")
        if (OUTPUT_ID === "main") {
          const camera = event.payload.camera
          if (camera?.active) {
            if (camera.lowerThirdTheme.logo?.url) {
              preloadImage(camera.lowerThirdTheme.logo.url, "Lower-third logo")
            }
            void startCameraSource(camera)
          } else {
            stopCameraSource()
            void invoke("stop_ndi_input").catch(() => {})
            emitCameraStatus("idle")
          }
        }
        logDebug("Received broadcast:verse-update", {
          hasVerse: Boolean(event.payload.verse),
          blankLogo: Boolean(event.payload.blankLogo),
          themeId: event.payload.theme.id,
        })
        draw()
        pushNdiBurst()
      }
    )

    const unlistenAnnouncement =
      currentWindow.listen<AnnouncementPayload | null>(
        `broadcast:announcement:${OUTPUT_ID}`,
        (event) => {
          announcementRef.current = event.payload
          tickerOffsetRef.current = 0
          if (announcementTimerRef.current !== null) {
            clearTimeout(announcementTimerRef.current)
            announcementTimerRef.current = null
          }
          if (event.payload && event.payload.duration) {
            announcementTimerRef.current = window.setTimeout(() => {
              announcementRef.current = null
              announcementTimerRef.current = null
              refreshHtmlLowerThird()
              draw()
              pushNdiBurst()
            }, event.payload.duration * 1000)
          }
          logDebug("Received broadcast:announcement", event.payload)
          refreshHtmlLowerThird()
          draw()
          pushNdiBurst()
        }
      )

    const unlistenNdiConfig = currentWindow.listen<NdiConfigEventPayload>(
      `broadcast:ndi-config:${OUTPUT_ID}`,
      (event) => {
        ndiConfigRef.current = event.payload
        logDebug("Received broadcast:ndi-config", event.payload)
        // Push burst when NDI becomes active
        if (event.payload.active) pushNdiBurst()
      }
    )

    // Request current NDI status on mount (fixes race condition
    // where NDI is started before this window opens)
    void invoke<{
      active: boolean
      width: number
      height: number
      fps: number
    } | null>("get_ndi_status", { outputId: OUTPUT_ID })
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

    void currentWindow
      .emitTo("main", "broadcast:output-ready")
      .then(() => {
        logDebug("Sent broadcast:output-ready")
      })
      .catch(() => {
        console.warn("[broadcast-output] failed to send output-ready event")
      })

    return () => {
      unlisten.then((fn) => fn())
      unlistenAnnouncement.then((fn) => fn())
      unlistenNdiConfig.then((fn) => fn())
      if (announcementTimerRef.current !== null) {
        clearTimeout(announcementTimerRef.current)
      }
      if (verseMotionRafRef.current !== null) {
        cancelAnimationFrame(verseMotionRafRef.current)
        verseMotionRafRef.current = null
      }
    }
  }, [
    animateVerseMotion,
    draw,
    emitCameraStatus,
    logDebug,
    preloadBackgroundImage,
    preloadImage,
    pushNdiFrame,
    pushNdiBurst,
    refreshHtmlLowerThird,
    startCameraSource,
    stopCameraSource,
  ])

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
