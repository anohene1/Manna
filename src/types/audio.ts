export interface DeviceInfo {
  id: string
  name: string
  sample_rate: number
  channels: number
  is_default: boolean
}

export interface AudioLevel {
  rms: number
  peak: number
}

export interface AudioConfig {
  device_id: string | null
  sample_rate: number
  gain: number
}

export interface AudioTestDevice {
  requested_id: string | null
  actual_name: string
  sample_rate: number
  channels: number
  fell_back: boolean
}

export interface AudioTestMeter {
  rms: number
  peak: number
  rms_db: number
  peak_db: number
}

export interface AudioTestWaveform {
  samples: number[]
}

export interface AudioTestStopped {
  reason: string
}
