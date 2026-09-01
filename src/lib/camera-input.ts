export interface LocalVideoDevice {
  deviceId: string
  label: string
}

const ABORT_RETRY_DELAY_MS = 100
const ABORT_RETRY_COUNT = 2

export function isCameraAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  )
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

async function requestStreamWithAbortRetry(
  mediaDevices: MediaDevices,
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  let lastError: unknown
  for (let attempt = 0; attempt <= ABORT_RETRY_COUNT; attempt += 1) {
    try {
      return await mediaDevices.getUserMedia(constraints)
    } catch (error) {
      lastError = error
      if (!isCameraAbortError(error) || attempt === ABORT_RETRY_COUNT)
        throw error
      await wait(ABORT_RETRY_DELAY_MS)
    }
  }
  throw lastError
}

export async function playVideoWithAbortRetry(
  video: HTMLVideoElement
): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt <= ABORT_RETRY_COUNT; attempt += 1) {
    try {
      await video.play()
      return
    } catch (error) {
      lastError = error
      if (!isCameraAbortError(error) || attempt === ABORT_RETRY_COUNT)
        throw error
      await wait(ABORT_RETRY_DELAY_MS)
    }
  }
  throw lastError
}

export function preferredLocalVideoConstraints(
  deviceId: string
): MediaStreamConstraints {
  return {
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  }
}

export async function openLocalVideoStream(
  mediaDevices: MediaDevices | undefined,
  deviceId: string
): Promise<MediaStream> {
  if (!mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not supported by this system webview.")
  }
  try {
    return await requestStreamWithAbortRetry(
      mediaDevices,
      preferredLocalVideoConstraints(deviceId)
    )
  } catch (error) {
    if (
      !(error instanceof DOMException) ||
      error.name !== "OverconstrainedError"
    ) {
      throw error
    }
    return requestStreamWithAbortRetry(mediaDevices, {
      video: { deviceId: { exact: deviceId } },
      audio: false,
    })
  }
}

export async function discoverLocalVideoDevices(
  mediaDevices: MediaDevices | undefined
): Promise<LocalVideoDevice[]> {
  if (!mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not supported by this system webview.")
  }
  const permissionStream = await mediaDevices.getUserMedia({
    video: true,
    audio: false,
  })
  stopMediaStream(permissionStream)
  const devices = await mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }))
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
