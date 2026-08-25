/**
 * Codifica PCM do VAD em WAV para enviar ao STT de nuvem.
 */
export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const frameCount = pcm.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = 1 * bytesPerSample; // mono (1 channel)
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * bytesPerSample;
  const chunkSize = 36 + dataSize;

  // Create buffer for WAV file
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  // Helper to write ASCII string
  const writeString = (str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset++, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString('RIFF');
  view.setUint32(offset, chunkSize, true);
  offset += 4;
  writeString('WAVE');

  // fmt subchunk
  writeString('fmt ');
  view.setUint32(offset, 16, true); // Subchunk1Size (16 for PCM)
  offset += 4;
  view.setUint16(offset, 1, true); // AudioFormat (1 = PCM)
  offset += 2;
  view.setUint16(offset, 1, true); // NumChannels (1 = mono)
  offset += 2;
  view.setUint32(offset, sampleRate, true); // SampleRate
  offset += 4;
  view.setUint32(offset, byteRate, true); // ByteRate
  offset += 4;
  view.setUint16(offset, blockAlign, true); // BlockAlign
  offset += 2;
  view.setUint16(offset, 16, true); // BitsPerSample
  offset += 2;

  // data subchunk
  writeString('data');
  view.setUint32(offset, dataSize, true);
  offset += 4;

  // Write PCM samples as 16-bit integers
  for (let i = 0; i < frameCount; i++) {
    const sample = pcm[i];
    // Clamp to [-1, 1]
    const clamped = Math.max(-1, Math.min(1, sample));
    // Convert to 16-bit PCM
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
