// Audio processing utilities for Vani app

/**
 * Create a WAV buffer from PCM data
 * @param {Int16Array} pcmData - The PCM audio data
 * @returns {Uint8Array} - WAV formatted buffer
 */
export const createWavBuffer = (pcmData) => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataLength = pcmData.length * 2; // 16-bit = 2 bytes per sample

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, 16000, true); // Sample rate
  view.setUint32(28, 32000, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Combine header and PCM data
  const blob = new Uint8Array(header.byteLength + dataLength);
  blob.set(new Uint8Array(header), 0);
  blob.set(new Uint8Array(pcmData.buffer), header.byteLength);
  
  return blob;
};

/**
 * Helper function to write string into DataView
 * @param {DataView} view - The DataView to write to
 * @param {number} offset - Offset in the DataView
 * @param {string} string - String to write
 */
export const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Convert a buffer to base64 string safely
 * @param {Uint8Array} buffer - The buffer to convert
 * @returns {string} - Base64 encoded string
 */
export const convertToBase64 = async (buffer) => {
  const chunks = [];
  const chunkSize = 1024;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, buffer.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
};

/**
 * Convert Float32Array audio data to Int16Array
 * @param {Float32Array} audioData - Audio data in float format
 * @returns {Int16Array} - Audio data in 16-bit PCM format
 */
export const convertToInt16 = (audioData) => {
  const pcmData = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    const s = Math.max(-1, Math.min(1, audioData[i]));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcmData;
};

/**
 * Check if audio buffer contains actual sound (not just silence)
 * @param {Float32Array} buffer - Audio buffer to check
 * @param {number} threshold - Threshold for sound detection (default: 0.005)
 * @returns {boolean} - True if sound is detected, false otherwise
 */
export const hasSound = (buffer, threshold = 0.005) => {
  return buffer.some(sample => Math.abs(sample) > threshold);
};

/**
 * Initialize an audio context with optimal settings
 * @returns {AudioContext} - Initialized audio context
 */
export const createOptimizedAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return new AudioContextClass({
    sampleRate: 16000,
    latencyHint: 'interactive'
  });
}; 