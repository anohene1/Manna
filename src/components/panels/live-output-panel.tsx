import { PanelHeader } from "@/components/ui/panel-header"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { cn } from "@/lib/utils"
import { useBroadcastStore, useBibleStore } from "@/stores"
import { presentQueuedVerseLive } from "@/lib/queue-verse"

export function LiveOutputPanel() {
  const isLive = useBroadcastStore((s) => s.isLive)
  const liveVerse = useBroadcastStore((s) => s.liveVerse)
  const fullscreenImage = useBroadcastStore((s) => s.fullscreenImage)
  const blankLogo = useBroadcastStore((s) => s.blankLogo)
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const cameraActive = useBroadcastStore((s) => s.cameraActive)
  const programPreviewUrl = useBroadcastStore((s) => s.programPreviewUrl)

  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? themes[0]

  const onToggleLive = () => {
    const broadcast = useBroadcastStore.getState()
    if (isLive) {
      broadcast.clearScreen()
      return
    }
    // Going live: prefer whatever's already queued; fall back to selected
    // bible verse so the operator gets immediate visual feedback.
    const current =
      broadcast.liveVerse ??
      broadcast.fullscreenImage ??
      (broadcast.blankLogo ? "blank" : null)
    if (current) {
      broadcast.setLive(true)
      broadcast.syncBroadcastOutput()
      return
    }
    const bible = useBibleStore.getState()
    if (bible.selectedVerse) {
      presentQueuedVerseLive(bible.selectedVerse)
    } else {
      broadcast.setLive(true)
      broadcast.syncBroadcastOutput()
    }
  }

  const hasContent = Boolean(
    liveVerse || fullscreenImage || blankLogo || cameraActive
  )

  return (
    <div
      data-slot="live-output-panel"
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card",
        isLive && "shadow-[inset_0_2px_0_0_rgba(16,185,129,0.3)]"
      )}
    >
      <PanelHeader title="Live display">
        <button
          onClick={onToggleLive}
          className={cn(
            "flex items-center gap-2 rounded-full px-2.5 py-1 text-[0.625rem] font-medium tracking-wider uppercase transition-all",
            isLive
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isLive
                ? "animate-pulse bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                : "bg-muted-foreground/50"
            )}
          />
          {isLive ? "Live" : "Go live"}
        </button>
      </PanelHeader>

      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center p-3 transition-opacity",
          !isLive && hasContent && "opacity-70",
          !hasContent && "opacity-40"
        )}
      >
        {cameraActive && programPreviewUrl && !fullscreenImage && !blankLogo ? (
          <img
            src={programPreviewUrl}
            alt="Live camera program"
            className="aspect-video w-full rounded-md bg-black object-contain"
          />
        ) : (
          <CanvasVerse
            theme={activeTheme}
            verse={liveVerse}
            fullscreenImage={fullscreenImage}
            blankLogo={blankLogo}
          />
        )}
      </div>
    </div>
  )
}
