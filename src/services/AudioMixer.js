class AudioMixer {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.audioElement = null;
  }

  async createMixedStream(translatedAudioBuffer) {
    try {
      // Create buffer source for translated audio
      const source = this.audioContext.createBufferSource();
      source.buffer = translatedAudioBuffer;

      // Create gain node for volume control
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 1.0;

      // Connect nodes
      source.connect(gainNode);
      gainNode.connect(this.destination);

      // Start playback
      source.start(0);

      // Return the mixed stream
      return this.destination.stream;
    } catch (error) {
      console.error('Error creating mixed stream:', error);
      throw error;
    }
  }

  // Add a method to directly play the audio buffer
  async playTranslatedAudio(audioData) {
    try {
      // Resume audio context if it's suspended (needed for autoplay policies)
      if (this.audioContext.state === 'suspended') {
        console.log('Resuming suspended audio context');
        await this.audioContext.resume();
      }
      
      // Enhanced validation for audio data
      if (!audioData) {
        console.error('Audio data is null or undefined');
        return Promise.reject(new Error('Invalid audio data: null or undefined'));
      }
      
      if (typeof audioData === 'string') {
        if (audioData.length < 100) {
          console.error('Audio data string is too short:', audioData.length);
          return Promise.reject(new Error('Invalid audio data: too short'));
        }
        
        // Check if it's a valid base64 string
        try {
          atob(audioData.slice(0, 10)); // Just test a small portion
        } catch (e) {
          console.error('Audio data is not a valid base64 string');
          return Promise.reject(new Error('Invalid audio data: not a valid base64 string'));
        }
      }

      // Convert base64 to array buffer if needed
      let arrayBuffer;
      if (typeof audioData === 'string') {
        try {
          // Log the length of the base64 string for debugging
          console.log('Processing base64 audio string of length:', audioData.length);
          
          // Try to decode a small portion first to validate it's proper base64
          try {
            atob(audioData.substring(0, 10));
          } catch (e) {
            console.error('Invalid base64 encoding detected');
            throw new Error('Invalid base64 encoding');
          }
          
          // Convert base64 to array buffer with proper handling
          const binaryString = atob(audioData);
          console.log('Binary string length after base64 decode:', binaryString.length);
          
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
          
          // Initialize headerInfo variable outside the conditional block
          let headerInfo = null;
          
          // Only try to parse header if we have enough data
          if (arrayBuffer.byteLength >= 44) {
            // Log the first few bytes to debug WAV header
            const headerView = new DataView(arrayBuffer.slice(0, 44));
            headerInfo = {
              riff: String.fromCharCode(headerView.getUint8(0), headerView.getUint8(1), headerView.getUint8(2), headerView.getUint8(3)),
              format: String.fromCharCode(headerView.getUint8(8), headerView.getUint8(9), headerView.getUint8(10), headerView.getUint8(11)),
              sampleRate: headerView.getUint32(24, true),
              bitsPerSample: headerView.getUint16(34, true),
              dataChunk: String.fromCharCode(headerView.getUint8(36), headerView.getUint8(37), headerView.getUint8(38), headerView.getUint8(39))
            };
            console.log('WAV header check:', headerInfo);
          } else {
            console.error('Audio data too short to contain a valid WAV header');
            throw new Error('Audio data too short for WAV format');
          }
          
          // Verify if this is a valid WAV file
          if (!headerInfo || headerInfo.riff !== 'RIFF' || headerInfo.format !== 'WAVE') {
            console.warn('Invalid WAV header detected, attempting to fix');
            // The data might be raw PCM without a header, or the header might be corrupted
            // Let's try to create a proper WAV header
            const sampleRate = 16000; // Azure TTS uses 16kHz
            const numChannels = 1;    // Mono
            const bitsPerSample = 16;  // 16-bit
            
            // Create a new buffer with WAV header + audio data
            const wavHeader = new ArrayBuffer(44);
            const view = new DataView(wavHeader);
            const pcmData = new Uint8Array(arrayBuffer);
            const wavBuffer = new Uint8Array(wavHeader.byteLength + pcmData.length);
            
            // Write WAV header
            // "RIFF" chunk descriptor
            writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + pcmData.length, true);
            writeString(view, 8, 'WAVE');
            
            // "fmt " sub-chunk
            writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true); // fmt chunk size
            view.setUint16(20, 1, true);  // PCM format
            view.setUint16(22, numChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // byte rate
            view.setUint16(32, numChannels * bitsPerSample / 8, true); // block align
            view.setUint16(34, bitsPerSample, true);
            
            // "data" sub-chunk
            writeString(view, 36, 'data');
            view.setUint32(40, pcmData.length, true);
            
            // Combine header and PCM data
            wavBuffer.set(new Uint8Array(wavHeader), 0);
            wavBuffer.set(pcmData, 44);
            
            arrayBuffer = wavBuffer.buffer;
            console.log('Created new WAV buffer with proper header');
          }
        } catch (conversionError) {
          console.error('Error converting base64 to array buffer:', conversionError);
          throw new Error('Invalid audio data format');
        }
      } else {
        arrayBuffer = audioData;
      }
      
      // Helper function to write strings to DataView
      function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      }

      // Decode the audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Create a buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect to destination (speakers)
      source.connect(this.audioContext.destination);
      
      // Play the audio
      source.start(0);
      
      console.log('Playing translated audio:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels
      });
      
      return new Promise((resolve) => {
        source.onended = () => {
          console.log('Audio playback completed');
          resolve();
        };
      });
    } catch (error) {
      console.error('Error playing translated audio:', error);
      throw error;
    }
  }

  close() {
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

export default AudioMixer;