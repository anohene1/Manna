import { useRef, useState, useEffect, useCallback } from "react"
import { useSettingsStore } from "@/stores"
import { persistProjectorCalibration } from "@/stores/settings-store"
import {
  insetsToTransform,
  dragToInsets,
  IDENTITY_INSETS,
  type CalibrationHandle,
} from "@/lib/projector-calibration"
import { Button } from "@/components/ui/button"

const BOX_W = 480
const BOX_H = 270

const HANDLES: CalibrationHandle[] = [
  "top-left", "top", "top-right",
  "left", "right",
  "bottom-left", "bottom", "bottom-right",
]

function handlePosition(
  handle: CalibrationHandle,
  insets: { top: number; right: number; bottom: number; left: number },
): { leftPct: number; topPct: number } {
  const l = insets.left * 100
  const r = (1 - insets.right) * 100
  const t = insets.top * 100
  const b = (1 - insets.bottom) * 100
  const cx = (l + r) / 2
  const cy = (t + b) / 2
  const map: Record<CalibrationHandle, { leftPct: number; topPct: number }> = {
    "top-left": { leftPct: l, topPct: t },
    top: { leftPct: cx, topPct: t },
    "top-right": { leftPct: r, topPct: t },
    left: { leftPct: l, topPct: cy },
    right: { leftPct: r, topPct: cy },
    "bottom-left": { leftPct: l, topPct: b },
    bottom: { leftPct: cx, topPct: b },
    "bottom-right": { leftPct: r, topPct: b },
  }
  return map[handle]
}

export function ProjectorCalibrationSection() {
  const insets = useSettingsStore((s) => s.projectorCalibration)
  const [showTest, setShowTest] = useState(false)
  const dragRef = useRef<{ handle: CalibrationHandle; startX: number; startY: number; start: typeof insets } | null>(null)

  useEffect(() => {
    void persistProjectorCalibration(useSettingsStore.getState().projectorCalibration, true)
    return () => {
      void persistProjectorCalibration(useSettingsStore.getState().projectorCalibration, false)
    }
  }, [])

  useEffect(() => {
    void persistProjectorCalibration(useSettingsStore.getState().projectorCalibration, true)
  }, [showTest])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = (e.clientX - drag.startX) / BOX_W
    const dy = (e.clientY - drag.startY) / BOX_H
    const next = dragToInsets(drag.handle, { dx, dy }, drag.start)
    void persistProjectorCalibration(next, true)
  }, [])

  const onPointerUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
  }, [onPointerMove])

  const startDrag = (handle: CalibrationHandle) => (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      start: useSettingsStore.getState().projectorCalibration,
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
  }

  const t = insetsToTransform(insets, BOX_W, BOX_H)
  const scalePct = Math.round(t.scale * 100)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Drag the handles to mark the area your projector actually shows on the
        wall. The projection scales to fit inside it. A live guide appears on the
        projector while this panel is open.
      </p>

      <div
        className="relative mx-auto rounded-md border border-border bg-black"
        style={{ width: BOX_W, height: BOX_H }}
      >
        <div
          className="absolute border-2 border-cyan-400/80 bg-cyan-400/5"
          style={{
            left: `${insets.left * 100}%`,
            top: `${insets.top * 100}%`,
            right: `${insets.right * 100}%`,
            bottom: `${insets.bottom * 100}%`,
          }}
        >
          <div className="flex h-full items-center justify-center px-3 text-center">
            <span className="font-serif text-[11px] leading-tight text-white/80">
              John 3:16 — For God so loved the world…
            </span>
          </div>
        </div>

        {HANDLES.map((h) => {
          const pos = handlePosition(h, insets)
          return (
            <div
              key={h}
              onPointerDown={startDrag(h)}
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-sm border border-white bg-cyan-400 active:cursor-grabbing"
              style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
            />
          )
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          Scale {scalePct}% · insets T{Math.round(insets.top * 100)} R
          {Math.round(insets.right * 100)} B{Math.round(insets.bottom * 100)} L
          {Math.round(insets.left * 100)}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowTest((v) => !v)}>
            {showTest ? "Hide test pattern" : "Show test pattern"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void persistProjectorCalibration(IDENTITY_INSETS, true)}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
