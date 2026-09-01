import { beforeEach, describe, expect, it, vi } from "vitest"

const values = new Map<string, unknown>()
const getMock = vi.fn((key: string) => Promise.resolve(values.get(key)))
const setMock = vi.fn((key: string, value: unknown) => {
  values.set(key, value)
  return Promise.resolve()
})

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(() => Promise.resolve({ get: getMock, set: setMock })),
}))

vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }))

describe("camera settings persistence", () => {
  beforeEach(() => {
    values.clear()
    getMock.mockClear()
    setMock.mockClear()
    vi.resetModules()
  })

  it("hydrates source identity and presentation settings without activating camera", async () => {
    values.set("cameraSource", {
      type: "ndi",
      sourceName: "Sanctuary Camera",
      urlAddress: "ndi://sanctuary",
    })
    values.set("cameraFit", "contain")
    values.set("cameraMirrored", true)
    values.set("lowerThirdThemeId", "custom-lower-third")

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()

    expect(useSettingsStore.getState()).toEqual(
      expect.objectContaining({
        cameraSource: {
          type: "ndi",
          sourceName: "Sanctuary Camera",
          urlAddress: "ndi://sanctuary",
        },
        cameraFit: "contain",
        cameraMirrored: true,
        lowerThirdThemeId: "custom-lower-third",
      })
    )
    expect("cameraActive" in useSettingsStore.getState()).toBe(false)
  })

  it("persists only camera identity and presentation preferences", async () => {
    const { persistCameraPreferences } = await import("./settings-store")
    await persistCameraPreferences({
      source: { type: "local", deviceId: "camera-1", label: "Camera 1" },
      fit: "cover",
      mirrored: false,
      lowerThirdThemeId: "builtin-lower-third-classic",
    })

    expect(Object.fromEntries(values)).toEqual({
      cameraSource: {
        type: "local",
        deviceId: "camera-1",
        label: "Camera 1",
      },
      cameraFit: "cover",
      cameraMirrored: false,
      lowerThirdThemeId: "builtin-lower-third-classic",
    })
  })
})
