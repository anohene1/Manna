import { describe, expect, it, vi } from "vitest"
import {
  discoverLocalVideoDevices,
  openLocalVideoStream,
  playVideoWithAbortRetry,
  preferredLocalVideoConstraints,
  stopMediaStream,
} from "./camera-input"

function streamWithTracks(trackCount = 1): MediaStream {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }))
  return { getTracks: () => tracks } as unknown as MediaStream
}

describe("local camera input", () => {
  it("requests 1080p at up to 30fps for the exact selected device", () => {
    expect(preferredLocalVideoConstraints("capture-card")).toEqual({
      video: {
        deviceId: { exact: "capture-card" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    })
  })

  it("surfaces camera permission denial", async () => {
    const denied = new DOMException("Permission denied", "NotAllowedError")
    const mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(denied),
    } as unknown as MediaDevices

    await expect(openLocalVideoStream(mediaDevices, "camera-1")).rejects.toBe(
      denied
    )
  })

  it("retries the exact device without 1080p constraints when unsupported", async () => {
    const fallbackStream = streamWithTracks()
    const mediaDevices = {
      getUserMedia: vi
        .fn()
        .mockRejectedValueOnce(
          new DOMException("Unsupported resolution", "OverconstrainedError")
        )
        .mockResolvedValueOnce(fallbackStream),
    } as unknown as MediaDevices

    await expect(openLocalVideoStream(mediaDevices, "camera-1")).resolves.toBe(
      fallbackStream
    )
    expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
      video: { deviceId: { exact: "camera-1" } },
      audio: false,
    })
  })

  it("retries transient camera and video-play aborts", async () => {
    const stream = streamWithTracks()
    const mediaDevices = {
      getUserMedia: vi
        .fn()
        .mockRejectedValueOnce(new DOMException("Interrupted", "AbortError"))
        .mockResolvedValueOnce(stream),
    } as unknown as MediaDevices
    await expect(openLocalVideoStream(mediaDevices, "camera-1")).resolves.toBe(
      stream
    )
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(2)

    const video = {
      play: vi
        .fn()
        .mockRejectedValueOnce(new DOMException("Interrupted", "AbortError"))
        .mockResolvedValueOnce(undefined),
    } as unknown as HTMLVideoElement
    await expect(playVideoWithAbortRetry(video)).resolves.toBeUndefined()
    expect(video.play).toHaveBeenCalledTimes(2)
  })

  it("stops permission tracks and names unlabeled video devices", async () => {
    const permissionStream = streamWithTracks(2)
    const tracks = permissionStream.getTracks()
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(permissionStream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: "audioinput", deviceId: "mic", label: "Microphone" },
        { kind: "videoinput", deviceId: "camera-1", label: "" },
        { kind: "videoinput", deviceId: "camera-2", label: "Capture Card" },
      ]),
    } as unknown as MediaDevices

    await expect(discoverLocalVideoDevices(mediaDevices)).resolves.toEqual([
      { deviceId: "camera-1", label: "Camera 1" },
      { deviceId: "camera-2", label: "Capture Card" },
    ])
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
  })

  it("stops every track when a source is replaced or camera mode ends", () => {
    const stream = streamWithTracks(2)
    const tracks = stream.getTracks()
    stopMediaStream(stream)
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
  })
})
