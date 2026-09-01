import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  CameraIcon,
  PencilIcon,
  RefreshCwIcon,
  VideoOffIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  discoverLocalVideoDevices,
  openLocalVideoStream,
  stopMediaStream,
} from "@/lib/camera-input"
import { useBroadcastStore, useSettingsStore } from "@/stores"
import type { NdiInputSource, VideoFit, VideoInputConfig } from "@/types"

interface LocalSource {
  deviceId: string
  label: string
}

export function CameraInputDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const settings = useSettingsStore()
  const cameraActive = useBroadcastStore((state) => state.cameraActive)
  const cameraConnection = useBroadcastStore((state) => state.cameraConnection)
  const cameraError = useBroadcastStore((state) => state.cameraError)
  const programPreviewUrl = useBroadcastStore(
    (state) => state.programPreviewUrl
  )
  const themes = useBroadcastStore((state) => state.themes)
  const [sourceType, setSourceType] = useState<"local" | "ndi">(
    settings.cameraSource?.type ?? "local"
  )
  const [selectedSource, setSelectedSource] = useState<VideoInputConfig | null>(
    settings.cameraSource
  )
  const [fit, setFit] = useState<VideoFit>(settings.cameraFit)
  const [mirrored, setMirrored] = useState(settings.cameraMirrored)
  const [lowerThirdThemeId, setLowerThirdThemeId] = useState(
    settings.lowerThirdThemeId
  )
  const [localSources, setLocalSources] = useState<LocalSource[]>([])
  const [ndiSources, setNdiSources] = useState<NdiInputSource[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)

  const lowerThirdThemes = useMemo(
    () => themes.filter((theme) => theme.kind === "lower-third"),
    [themes]
  )

  const syncSavedPreferences = () => {
    const saved = useSettingsStore.getState()
    setSourceType(saved.cameraSource?.type ?? "local")
    setSelectedSource(saved.cameraSource)
    setFit(saved.cameraFit)
    setMirrored(saved.cameraMirrored)
    setLowerThirdThemeId(saved.lowerThirdThemeId)
  }

  const stopLocalPreview = useCallback(() => {
    stopMediaStream(previewStreamRef.current)
    previewStreamRef.current = null
    if (previewRef.current) previewRef.current.srcObject = null
  }, [])

  const refreshLocalSources = useCallback(async () => {
    setRefreshing(true)
    setDiscoveryError(null)
    try {
      const cameras = await discoverLocalVideoDevices(navigator.mediaDevices)
      setLocalSources(cameras)
      if (cameras.length === 0)
        throw new Error("No video input devices were found.")
      if (selectedSource?.type !== "local") {
        const first = cameras[0]
        setSelectedSource({ type: "local", ...first })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDiscoveryError(message)
    } finally {
      setRefreshing(false)
    }
  }, [selectedSource])

  const refreshNdiSources = useCallback(async () => {
    setRefreshing(true)
    setDiscoveryError(null)
    try {
      const sources = await invoke<NdiInputSource[]>("list_ndi_sources")
      setNdiSources(sources)
      if (sources.length === 0)
        throw new Error("No NDI sources are currently visible.")
      if (selectedSource?.type !== "ndi") {
        const first = sources[0]
        setSelectedSource({
          type: "ndi",
          sourceName: first.name,
          urlAddress: first.urlAddress,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDiscoveryError(message)
    } finally {
      setRefreshing(false)
    }
  }, [selectedSource])

  useEffect(() => {
    if (!open) {
      stopLocalPreview()
      return
    }
    if (sourceType === "local" && localSources.length === 0) {
      queueMicrotask(() => void refreshLocalSources())
    } else if (sourceType === "ndi" && ndiSources.length === 0) {
      queueMicrotask(() => void refreshNdiSources())
    }
  }, [
    open,
    sourceType,
    localSources.length,
    ndiSources.length,
    refreshLocalSources,
    refreshNdiSources,
    stopLocalPreview,
  ])

  useEffect(() => {
    if (!open || sourceType !== "local" || !navigator.mediaDevices) return
    const handleDeviceChange = () => void refreshLocalSources()
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange)
    return () =>
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange
      )
  }, [open, refreshLocalSources, sourceType])

  useEffect(() => {
    stopLocalPreview()
    if (!open || cameraActive || selectedSource?.type !== "local") return
    let cancelled = false
    void openLocalVideoStream(navigator.mediaDevices, selectedSource.deviceId)
      .then((stream) => {
        if (cancelled) {
          stopMediaStream(stream)
          return
        }
        previewStreamRef.current = stream
        if (previewRef.current) {
          previewRef.current.srcObject = stream
          void previewRef.current.play()
        }
      })
      .catch((error) => setDiscoveryError(String(error)))
    return () => {
      cancelled = true
      stopLocalPreview()
    }
  }, [open, cameraActive, selectedSource, stopLocalPreview])

  const changeLocalSource = (deviceId: string) => {
    const source = localSources.find(
      (candidate) => candidate.deviceId === deviceId
    )
    if (source) {
      const next = { type: "local" as const, ...source }
      setSelectedSource(next)
      if (cameraActive) {
        useBroadcastStore.getState().configureCamera({
          source: next,
          fit,
          mirrored,
          lowerThirdThemeId,
        })
      }
    }
  }

  const changeNdiSource = (sourceName: string) => {
    const source = ndiSources.find((candidate) => candidate.name === sourceName)
    if (source) {
      const next = {
        type: "ndi",
        sourceName: source.name,
        urlAddress: source.urlAddress,
      } as const
      setSelectedSource(next)
      if (cameraActive) {
        useBroadcastStore.getState().configureCamera({
          source: next,
          fit,
          mirrored,
          lowerThirdThemeId,
        })
      }
    }
  }

  const startCamera = () => {
    if (!selectedSource) {
      toast.error("Choose a camera source first")
      return
    }
    stopLocalPreview()
    useBroadcastStore.getState().startCamera({
      source: selectedSource,
      fit,
      mirrored,
      lowerThirdThemeId,
    })
  }

  const selectedLowerThird = lowerThirdThemes.find(
    (theme) => theme.id === lowerThirdThemeId
  )

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) syncSavedPreferences()
        onOpenChange(nextOpen)
      }}
    >
      <DrawerContent>
        <DrawerHeader className="mx-auto w-full max-w-4xl">
          <DrawerTitle>Camera input</DrawerTitle>
          <DrawerDescription>
            Add a local camera, capture card, or NDI feed behind Bible lower
            thirds.
          </DrawerDescription>
        </DrawerHeader>

        <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 pb-5 md:grid-cols-[1.25fr_1fr]">
          <div className="space-y-3">
            <div className="aspect-video overflow-hidden rounded-lg bg-black ring-1 ring-border">
              {cameraActive && programPreviewUrl ? (
                <img
                  src={programPreviewUrl}
                  alt="Live program preview"
                  className="h-full w-full object-contain"
                />
              ) : selectedSource?.type === "local" ? (
                <video
                  ref={previewRef}
                  muted
                  playsInline
                  className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${mirrored ? "-scale-x-100" : ""}`}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/45">
                  {cameraActive
                    ? "Waiting for program preview…"
                    : "Start the NDI source to preview it"}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`size-2 rounded-full ${cameraConnection === "connected" ? "bg-emerald-500" : cameraConnection === "error" || cameraConnection === "disconnected" ? "bg-destructive" : "bg-muted-foreground"}`}
              />
              <span className="text-muted-foreground capitalize">
                {cameraConnection}
              </span>
              {(cameraError || discoveryError) && (
                <span className="truncate text-destructive">
                  {cameraError || discoveryError}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Tabs
              value={sourceType}
              onValueChange={(value) => {
                setSourceType(value as "local" | "ndi")
                setSelectedSource(null)
                setDiscoveryError(null)
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="local">Local device</TabsTrigger>
                <TabsTrigger value="ndi">NDI</TabsTrigger>
              </TabsList>
              <TabsContent value="local" className="pt-2">
                <SourceRow
                  value={
                    selectedSource?.type === "local"
                      ? selectedSource.deviceId
                      : ""
                  }
                  onValueChange={changeLocalSource}
                  onRefresh={() => void refreshLocalSources()}
                  refreshing={refreshing}
                  placeholder="Choose a camera"
                  options={localSources.map((source) => ({
                    value: source.deviceId,
                    label: source.label,
                  }))}
                />
              </TabsContent>
              <TabsContent value="ndi" className="pt-2">
                <SourceRow
                  value={
                    selectedSource?.type === "ndi"
                      ? selectedSource.sourceName
                      : ""
                  }
                  onValueChange={changeNdiSource}
                  onRefresh={() => void refreshNdiSources()}
                  refreshing={refreshing}
                  placeholder="Choose an NDI source"
                  options={ndiSources.map((source) => ({
                    value: source.name,
                    label: source.name,
                  }))}
                />
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                Fit
                <Select
                  value={fit}
                  onValueChange={(value) => {
                    const nextFit = value as VideoFit
                    setFit(nextFit)
                    if (cameraActive && selectedSource) {
                      useBroadcastStore.getState().configureCamera({
                        source: selectedSource,
                        fit: nextFit,
                        mirrored,
                        lowerThirdThemeId,
                      })
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Fill frame</SelectItem>
                    <SelectItem value="contain">Fit inside</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                Mirror video
                <Switch
                  checked={mirrored}
                  onCheckedChange={(nextMirrored) => {
                    setMirrored(nextMirrored)
                    if (cameraActive && selectedSource) {
                      useBroadcastStore.getState().configureCamera({
                        source: selectedSource,
                        fit,
                        mirrored: nextMirrored,
                        lowerThirdThemeId,
                      })
                    }
                  }}
                />
              </label>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Lower third</span>
              <div className="flex gap-2">
                <Select
                  value={lowerThirdThemeId}
                  onValueChange={(nextThemeId) => {
                    setLowerThirdThemeId(nextThemeId)
                    if (cameraActive && selectedSource) {
                      useBroadcastStore.getState().configureCamera({
                        source: selectedSource,
                        fit,
                        mirrored,
                        lowerThirdThemeId: nextThemeId,
                      })
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lowerThirdThemes.map((theme) => (
                      <SelectItem key={theme.id} value={theme.id}>
                        {theme.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!selectedLowerThird}
                  onClick={() => {
                    if (!selectedLowerThird) return
                    useBroadcastStore
                      .getState()
                      .startEditing(selectedLowerThird.id)
                    useBroadcastStore.getState().setDesignerOpen(true)
                  }}
                  title="Edit this lower third"
                >
                  <PencilIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DrawerFooter className="mx-auto w-full max-w-4xl flex-row justify-end">
          {cameraActive ? (
            <Button
              variant="destructive"
              onClick={() => useBroadcastStore.getState().stopCamera()}
            >
              <VideoOffIcon className="size-4" /> Stop camera
            </Button>
          ) : (
            <Button
              onClick={startCamera}
              disabled={!selectedSource || refreshing}
            >
              <CameraIcon className="size-4" /> Start camera
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function SourceRow({
  value,
  onValueChange,
  onRefresh,
  refreshing,
  placeholder,
  options,
}: {
  value: string
  onValueChange: (value: string) => void
  onRefresh: () => void
  refreshing: boolean
  placeholder: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCwIcon
          className={`size-4 ${refreshing ? "animate-spin" : ""}`}
        />
      </Button>
    </div>
  )
}
