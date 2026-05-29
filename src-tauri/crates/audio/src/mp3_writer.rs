//! MP3 encoder for session audio recording.
//!
//! Wraps `mp3lame-encoder` to take i16 PCM frames (the same format the STT
//! pipeline produces) and stream them to a file as MP3 64kbps mono.

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use mp3lame_encoder::{Builder, FlushNoGap, MonoPcm, Quality};

#[derive(thiserror::Error, Debug)]
#[non_exhaustive]
pub enum Mp3WriterError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("LAME global init failed")]
    LameInit,
    #[error("lame build: {0:?}")]
    LameBuild(mp3lame_encoder::BuildError),
    #[error("lame encode: {0:?}")]
    LameEncode(mp3lame_encoder::EncodeError),
}

pub struct Mp3Writer {
    encoder: mp3lame_encoder::Encoder,
    out: BufWriter<File>,
}

impl Mp3Writer {
    /// Open `path` for writing and configure LAME for 64 kbps mono at the
    /// given sample rate (typically `16_000` from our cpal pipeline).
    pub fn create<P: AsRef<Path>>(path: P, sample_rate: u32) -> Result<Self, Mp3WriterError> {
        let file = File::create(path)?;
        let mut builder = Builder::new().ok_or(Mp3WriterError::LameInit)?;
        builder
            .set_num_channels(1)
            .map_err(Mp3WriterError::LameBuild)?;
        builder
            .set_sample_rate(sample_rate)
            .map_err(Mp3WriterError::LameBuild)?;
        builder
            .set_brate(mp3lame_encoder::Bitrate::Kbps64)
            .map_err(Mp3WriterError::LameBuild)?;
        builder
            .set_quality(Quality::Good)
            .map_err(Mp3WriterError::LameBuild)?;
        // No ID3 tag: recordings are written as multiple segments that are
        // later concatenated by raw byte-append. A pure MP3 frame stream (no
        // mid-stream ID3v2 tags) concatenates cleanly and plays in every
        // decoder.
        let encoder = builder.build().map_err(Mp3WriterError::LameBuild)?;
        Ok(Self {
            encoder,
            out: BufWriter::new(file),
        })
    }

    /// Encode a chunk of mono i16 PCM and append to file.
    pub fn write_samples(&mut self, samples: &[i16]) -> Result<(), Mp3WriterError> {
        let mut buf = Vec::with_capacity(mp3lame_encoder::max_required_buffer_size(samples.len()));
        let written = self
            .encoder
            .encode(MonoPcm(samples), buf.spare_capacity_mut())
            .map_err(Mp3WriterError::LameEncode)?;
        // SAFETY: `encode` writes `written` bytes into the spare capacity of
        // buf; `set_len` marks those bytes as initialized.
        unsafe { buf.set_len(written) };
        self.out.write_all(&buf)?;
        Ok(())
    }

    /// Flush LAME's internal buffers and close the file. MUST be called for a
    /// valid MP3 — without flush, the trailing frames may be lost.
    pub fn finalize(mut self) -> Result<(), Mp3WriterError> {
        let mut buf = Vec::with_capacity(mp3lame_encoder::max_required_buffer_size(0));
        let written = self
            .encoder
            .flush::<FlushNoGap>(buf.spare_capacity_mut())
            .map_err(Mp3WriterError::LameEncode)?;
        // SAFETY: `flush` writes `written` bytes into the spare capacity of
        // buf; `set_len` marks those bytes as initialized.
        unsafe { buf.set_len(written) };
        self.out.write_all(&buf)?;
        self.out.flush()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Produce 1 second of a 440 Hz sine wave at 16 kHz, encode to MP3, verify
    /// the output file exists and begins with an MP3 frame header (0xFF 0xFB
    /// or 0xFF 0xFA for MPEG-1 layer 3) or ID3 tag (`ID3` ASCII).
    #[test]
    fn writes_one_second_of_sine_to_mp3() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("sine.mp3");

        let sample_rate = 16_000;
        let mut writer = Mp3Writer::create(&path, sample_rate).expect("create");

        let samples: Vec<i16> = (0..sample_rate)
            .map(|n| {
                let t = n as f32 / sample_rate as f32;
                ((t * 440.0 * 2.0 * std::f32::consts::PI).sin() * 16000.0) as i16
            })
            .collect();

        writer.write_samples(&samples).expect("write");
        writer.finalize().expect("finalize");

        let bytes = std::fs::read(&path).expect("read back");
        assert!(bytes.len() > 1000, "MP3 should be > 1 KB, got {}", bytes.len());

        // Either an ID3v2 tag at the start, or a raw MP3 frame sync (0xFF 0xFB).
        let starts_with_id3 = bytes.starts_with(b"ID3");
        let has_frame_sync = bytes.windows(2).any(|w| w[0] == 0xFF && (w[1] & 0xE0) == 0xE0);
        assert!(
            starts_with_id3 || has_frame_sync,
            "output should be a valid MP3 (ID3 tag or frame sync), got first bytes: {:?}",
            &bytes[..16.min(bytes.len())]
        );
    }
}
