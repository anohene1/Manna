import { beforeEach, describe, expect, it, vi } from "vitest"

const emitMock = vi.fn()
const invokeMock = vi.fn()

vi.mock("@tauri-apps/api/event", () => ({
  emit: emitMock,
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

describe("broadcast store sync", () => {
  beforeEach(async () => {
    emitMock.mockReset()
    emitMock.mockResolvedValue(undefined)
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("syncBroadcastOutput emits current theme and verse for each output", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const theme = useBroadcastStore.getState().themes[0]
    useBroadcastStore.setState({
      activeThemeId: theme.id,
      liveVerse: {
        reference: "John 3:16",
        segments: [{ text: "For God so loved the world", verseNumber: 16 }],
      },
    })

    emitMock.mockClear()
    useBroadcastStore.getState().syncBroadcastOutput()

    expect(emitMock).toHaveBeenCalledTimes(3)
    expect(emitMock).toHaveBeenCalledWith(
      "projector:calibration",
      expect.objectContaining({ editing: false })
    )
    expect(emitMock).toHaveBeenCalledWith(
      "broadcast:verse-update:main",
      expect.objectContaining({
        theme: expect.objectContaining({ id: theme.id }),
        verse: expect.objectContaining({ reference: "John 3:16" }),
      })
    )
    expect(emitMock).toHaveBeenCalledWith(
      "broadcast:verse-update:alt",
      expect.objectContaining({
        theme: expect.objectContaining({ id: theme.id }),
        verse: expect.objectContaining({ reference: "John 3:16" }),
      })
    )
  })

  it("updates nested draft fields used by designer sliders", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const builtin = useBroadcastStore.getState().themes[0]

    useBroadcastStore.getState().startEditing(builtin.id)
    useBroadcastStore.getState().updateDraftNested("verseText.fontSize", 88)

    expect(useBroadcastStore.getState().draftTheme?.verseText.fontSize).toBe(88)
  })

  it("saving a draft based on a built-in persists the new custom theme", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const builtin = useBroadcastStore.getState().themes[0]

    useBroadcastStore.getState().startEditing(builtin.id)
    useBroadcastStore.getState().saveDraft()

    const custom = useBroadcastStore.getState().draftTheme
    expect(custom).toEqual(
      expect.objectContaining({
        builtin: false,
        name: `${builtin.name} (Custom)`,
      })
    )
    expect(invokeMock).toHaveBeenCalledWith(
      "save_custom_theme",
      expect.objectContaining({
        id: custom?.id,
        name: custom?.name,
        themeJson: expect.stringContaining(`"id":"${custom?.id}"`),
      })
    )
  })

  it("duplicating a theme selects and edits the new custom copy", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const builtin = useBroadcastStore.getState().themes[0]

    useBroadcastStore.getState().duplicateTheme(builtin.id)

    const state = useBroadcastStore.getState()
    const copy = state.themes.find(
      (theme) => theme.name === `${builtin.name} Copy`
    )
    expect(copy).toEqual(expect.objectContaining({ builtin: false }))
    expect(state.editingThemeId).toBe(copy?.id)
    expect(state.draftTheme?.id).toBe(copy?.id)
  })

  it("emits camera configuration on main output only", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const lowerThird = useBroadcastStore
      .getState()
      .themes.find((theme) => theme.kind === "lower-third")!
    useBroadcastStore.setState({
      cameraActive: true,
      cameraSource: {
        type: "local",
        deviceId: "camera-1",
        label: "Capture Card",
      },
      cameraFit: "cover",
      cameraMirrored: false,
      lowerThirdThemeId: lowerThird.id,
    })

    emitMock.mockClear()
    useBroadcastStore.getState().syncBroadcastOutput()

    const mainPayload = emitMock.mock.calls.find(
      ([event]) => event === "broadcast:verse-update:main"
    )?.[1]
    const altPayload = emitMock.mock.calls.find(
      ([event]) => event === "broadcast:verse-update:alt"
    )?.[1]
    expect({
      main: mainPayload.camera?.active,
      alt: altPayload.camera,
    }).toEqual({
      main: true,
      alt: undefined,
    })
  })

  it("starts camera mode manually with the selected presentation settings", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const lowerThird = useBroadcastStore
      .getState()
      .themes.find((theme) => theme.kind === "lower-third")!
    const source = {
      type: "local" as const,
      deviceId: "capture-1",
      label: "HDMI Capture",
    }

    useBroadcastStore.getState().startCamera({
      source,
      fit: "contain",
      mirrored: true,
      lowerThirdThemeId: lowerThird.id,
    })

    expect(useBroadcastStore.getState()).toEqual(
      expect.objectContaining({
        cameraActive: true,
        cameraSource: source,
        cameraFit: "contain",
        cameraMirrored: true,
        lowerThirdThemeId: lowerThird.id,
        cameraConnection: "connecting",
      })
    )
    expect(invokeMock).toHaveBeenCalledWith("open_broadcast_window", {
      outputId: "main",
      monitorIndex: 0,
    })
  })

  it("clears the verse but keeps an active camera live", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({
      cameraActive: true,
      isLive: true,
      liveVerse: {
        reference: "Psalm 23:1",
        segments: [{ text: "The Lord is my shepherd" }],
      },
    })

    useBroadcastStore.getState().clearScreen()

    expect(useBroadcastStore.getState()).toEqual(
      expect.objectContaining({
        cameraActive: true,
        isLive: true,
        liveVerse: null,
      })
    )
    expect(invokeMock).not.toHaveBeenCalledWith(
      "close_broadcast_window",
      expect.anything()
    )
  })

  it("stops camera mode without clearing a live verse", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({
      cameraActive: true,
      isLive: true,
      liveVerse: {
        reference: "John 3:16",
        segments: [{ text: "For God so loved" }],
      },
    })

    useBroadcastStore.getState().stopCamera()

    expect(useBroadcastStore.getState()).toEqual(
      expect.objectContaining({ cameraActive: false, isLive: true })
    )
  })

  it("preserves the camera verse beneath temporary takeover content", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const verse = {
      reference: "Romans 8:28",
      segments: [{ text: "All things work together for good" }],
    }
    useBroadcastStore.setState({
      cameraActive: true,
      isLive: true,
      liveVerse: verse,
    })

    useBroadcastStore.getState().setFullscreenImage({
      url: "asset://announcement.png",
      label: "Announcement",
    })
    expect(useBroadcastStore.getState().liveVerse).toEqual(verse)

    useBroadcastStore.getState().setFullscreenImage(null)
    expect(useBroadcastStore.getState()).toEqual(
      expect.objectContaining({
        cameraActive: true,
        liveVerse: verse,
        fullscreenImage: null,
      })
    )
  })
})
