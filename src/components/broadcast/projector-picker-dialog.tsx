import { useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { MonitorIcon, RefreshCwIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useProjectorPicker, type PickerMonitor } from "@/lib/projector-picker"

const STAGE_HEIGHT = 280
const STAGE_PADDING = 24

export function ProjectorPickerDialog() {
  const isOpen = useProjectorPicker((s) => s.isOpen)
  const monitors = useProjectorPicker((s) => s.monitors)
  const setMonitors = useProjectorPicker((s) => s.setMonitors)
  const pick = useProjectorPicker((s) => s.pick)
  const cancel = useProjectorPicker((s) => s.cancel)

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageWidth, setStageWidth] = useState(640)

  useEffect(() => {
    if (!isOpen) return
    const el = stageRef.current
    if (!el) return
    const update = () => setStageWidth(el.clientWidth || 640)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isOpen])

  // Poll list_monitors while picker is open so plugging in a new projector
  // shows up live. macOS sometimes takes a beat to report a hot-plug; 2s is
  // a sweet spot between snappy and cheap.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const tick = async () => {
      try {
        const fresh = await invoke<PickerMonitor[]>("list_monitors")
        if (cancelled) return
        // Only push state if monitor signature changed — avoids re-render storm.
        const sig = (m: PickerMonitor[]) =>
          m.map((x) => `${x.name}|${x.x},${x.y}|${x.width}x${x.height}`).join("§")
        if (sig(fresh) !== sig(monitors)) setMonitors(fresh)
      } catch {
        /* ignore */
      }
    }
    const id = window.setInterval(tick, 2000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, monitors.length])

  const layout = useMemo(
    () => computeLayout(monitors, stageWidth),
    [monitors, stageWidth],
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Project to which screen?</DialogTitle>
          <DialogDescription>
            Choose where the projector window should appear. Layout mirrors the
            way your displays are arranged in System Settings.
          </DialogDescription>
        </DialogHeader>

        {/* Proportional arrangement stage */}
        <div
          ref={stageRef}
          className="relative w-full rounded-2xl border border-border bg-muted/30"
          style={{ height: STAGE_HEIGHT }}
        >
          {monitors.map((m, idx) => {
            const r = layout.rects[idx]
            if (!r) return null
            const isHovered = hoveredIdx === idx
            return (
              <button
                key={idx}
                type="button"
                onClick={() => pick(idx)}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  position: "absolute",
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                }}
                className={`group flex flex-col items-center justify-center rounded-lg border-2 text-center transition-all ${
                  isHovered
                    ? "border-primary bg-primary/15 shadow-[0_0_0_3px_rgba(120,180,140,0.18)]"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <span className="text-[10px] font-medium text-foreground">
                  {idx + 1}
                </span>
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {m.width}×{m.height}
                </span>
                {m.is_primary && (
                  <span className="mt-0.5 rounded-full bg-muted px-1 py-px text-[7px] font-semibold uppercase text-muted-foreground">
                    Primary
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Hovered monitor details */}
        <div className="mt-1 flex min-h-[44px] items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2">
          {hoveredIdx != null && monitors[hoveredIdx] ? (
            <>
              <div className="flex items-center gap-2">
                <MonitorIcon className="size-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {monitors[hoveredIdx].name || `Display ${hoveredIdx + 1}`}
                </span>
                {monitors[hoveredIdx]?.is_primary && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                    Primary
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {monitors[hoveredIdx].width} × {monitors[hoveredIdx].height} ·
                {" "}{monitors[hoveredIdx].scale.toFixed(2)}× scale
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              Hover a display to preview · {monitors.length}{" "}
              {monitors.length === 1 ? "display" : "displays"} detected
            </span>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              try {
                const fresh = await invoke<PickerMonitor[]>("list_monitors")
                setMonitors(fresh)
              } catch {
                /* ignore */
              }
            }}
            title="Refresh display list"
          >
            <RefreshCwIcon className="size-3.5" />
            Refresh
          </Button>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Compute stage-space rects for each monitor mirroring the OS arrangement.
 *
 * macOS quirk: `m.size()` is in physical pixels but `m.position()` is in
 * scaled (logical) pixels. Mixing them puts a 2x-DPI primary at half its
 * neighbors' coordinate scale, which causes the layout to overlap. Convert
 * both to logical pixels (size ÷ scale_factor) before laying out so positions
 * line up with sizes.
 */
function computeLayout(monitors: PickerMonitor[], stageWidth: number): { rects: Rect[] } {
  if (monitors.length === 0) return { rects: [] }

  // Tauri reports position + size in PHYSICAL pixels. macOS Display Settings
  // exposes positions in LOGICAL pixels (post-scaling). To make both monitors
  // sit at consistent units, divide each rect's physical extents by its own
  // scale factor — yields logical-space rect in the OS arrangement frame.
  const logical = monitors.map((m) => {
    const s = Math.max(m.scale || 1, 1)
    return {
      x: m.x / s,
      y: m.y / s,
      w: m.width / s,
      h: m.height / s,
    }
  })

  console.info("[picker] monitors", monitors, "→ logical", logical)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const m of logical) {
    minX = Math.min(minX, m.x)
    minY = Math.min(minY, m.y)
    maxX = Math.max(maxX, m.x + m.w)
    maxY = Math.max(maxY, m.y + m.h)
  }
  const bboxW = Math.max(1, maxX - minX)
  const bboxH = Math.max(1, maxY - minY)
  const availW = stageWidth - STAGE_PADDING * 2
  const availH = STAGE_HEIGHT - STAGE_PADDING * 2
  const scale = Math.min(availW / bboxW, availH / bboxH)
  const offsetX = (stageWidth - bboxW * scale) / 2 - minX * scale
  const offsetY = (STAGE_HEIGHT - bboxH * scale) / 2 - minY * scale

  // Final safety clamp — never let a rect overflow the stage even if the OS
  // reports something weird (e.g. mirrored arrangement, negative coords).
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v))

  return {
    rects: logical.map((m) => {
      const left = clamp(m.x * scale + offsetX, 0, stageWidth)
      const top = clamp(m.y * scale + offsetY, 0, STAGE_HEIGHT)
      const width = clamp(m.w * scale, 0, stageWidth - left)
      const height = clamp(m.h * scale, 0, STAGE_HEIGHT - top)
      return { left, top, width, height }
    }),
  }
}
