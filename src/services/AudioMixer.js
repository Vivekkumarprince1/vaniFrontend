class AudioMixer {
  constructor() {
    // Initialize AudioContext on constructor
    this.audioContext = null;
    this.initAudioContext();
    this.destination = null;
    this.audioElement = null;
  }

  // Add method to initialize AudioContext
  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.destination = this.audioContext.createMediaStreamDestination();
      console.log('AudioContext initialized successfully:', this.audioContext.state);
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
    }
  }

  // Add method to ensure AudioContext is active
  async ensureAudioContextActive() {
    if (!this.audioContext) {
      this.initAudioContext();
    }
    
    if (this.audioContext.state === 'suspended') {
      try {
        console.log('Resuming suspended audio context');
        await this.audioContext.resume();
        console.log('AudioContext resumed successfully:', this.audioContext.state);
      } catch (error) {
        console.error('Failed to resume AudioContext:', error);
        // Re-initialize if resume fails
        this.initAudioContext();
      }
    }
    return this.audioContext.state === 'running';
  }

  async createMixedStream(translatedAudioBuffer) {
    try {
      // Ensure audio context is active
      await this.ensureAudioContextActive();
      
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

  // Revised playTranslatedAudio method with better error handling
  async playTranslatedAudio(audioData) {
    try {
      console.log('AudioMixer: Starting playTranslatedAudio method');
      // Ensure audio context is active before proceeding
      const contextActive = await this.ensureAudioContextActive();
      if (!contextActive) {
        console.error('AudioMixer: Failed to activate AudioContext');
        throw new Error('Failed to activate AudioContext');
      }
      
      console.log('AudioMixer: AudioContext is active:', this.audioContext.state);
      
      // Enhanced validation for audio data
      if (!audioData) {
        console.error('AudioMixer: Audio data is null or undefined');
        return Promise.reject(new Error('Invalid audio data: null or undefined'));
      }
      
      if (typeof audioData === 'string') {
        if (audioData.length < 100) {
          console.error('AudioMixer: Audio data string is too short:', audioData.length);
          return Promise.reject(new Error('Invalid audio data: too short'));
        }
        
        // Check if it's a valid base64 string
        try {
          atob(audioData.slice(0, 10)); // Just test a small portion
        } catch (e) {
          console.error('AudioMixer: Audio data is not a valid base64 string');
          return Promise.reject(new Error('Invalid audio data: not a valid base64 string'));
        }
      }
      
      // Try unlocking audio context with user interaction simulation
      if (this.audioContext.state !== 'running') {
        console.log('AudioMixer: Attempting to force-resume AudioContext');
        try {
          // Create and play a short silent sound to unlock AudioContext
          const silentBuffer = this.audioContext.createBuffer(1, 1, 22050);
          const source = this.audioContext.createBufferSource();
          source.buffer = silentBuffer;
          source.connect(this.audioContext.destination);
          source.start(0);
          
          // Attempt to resume
          await this.audioContext.resume();
          console.log('AudioMixer: Force-resumed AudioContext:', this.audioContext.state);
        } catch (e) {
          console.warn('AudioMixer: Force-resume failed:', e);
        }
      }
      
      // Dynamically create UI button for audio unlock
      if (this.audioContext.state !== 'running') {
        console.log('AudioMixer: Creating unlock button');
        // Create a temporary button to allow user interaction
        const tempButton = document.createElement('button');
        tempButton.innerHTML = '🔊 Click to enable audio';
        tempButton.style.position = 'fixed';
        tempButton.style.top = '10px';
        tempButton.style.right = '10px';
        tempButton.style.zIndex = '9999';
        tempButton.style.padding = '10px';
        tempButton.style.backgroundColor = '#4CAF50';
        tempButton.style.color = 'white';
        tempButton.style.border = 'none';
        tempButton.style.borderRadius = '5px';
        tempButton.style.cursor = 'pointer';
        document.body.appendChild(tempButton);
        
        await new Promise(resolve => {
          tempButton.onclick = async () => {
            console.log('AudioMixer: User clicked unlock button');
            await this.audioContext.resume();
            document.body.removeChild(tempButton);
            resolve();
          };
          
          // Auto-remove after 10 seconds to avoid UI clutter
          setTimeout(() => {
            if (document.body.contains(tempButton)) {
              console.log('AudioMixer: Auto-removing unlock button');
              document.body.removeChild(tempButton);
              resolve();
            }
          }, 10000);
        });
      }

      // Convert base64 to array buffer if needed
      let arrayBuffer;
      if (typeof audioData === 'string') {
        try {
          // Log the length of the base64 string for debugging
          console.log('AudioMixer: Processing base64 audio string of length:', audioData.length);
          
          // Try to decode a small portion first to validate it's proper base64
          try {
            atob(audioData.substring(0, 10));
          } catch (e) {
            console.error('AudioMixer: Invalid base64 encoding detected');
            throw new Error('Invalid base64 encoding');
          }
          
          // Convert base64 to array buffer with proper handling
          const binaryString = atob(audioData);
          console.log('AudioMixer: Binary string length after base64 decode:', binaryString.length);
          
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
            console.log('AudioMixer: WAV header check:', headerInfo);
          } else {
            console.error('AudioMixer: Audio data too short to contain a valid WAV header');
            throw new Error('Audio data too short for WAV format');
          }
          
          // Verify if this is a valid WAV file
          if (!headerInfo || headerInfo.riff !== 'RIFF' || headerInfo.format !== 'WAVE') {
            console.warn('AudioMixer: Invalid WAV header detected, attempting to fix');
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
            console.log('AudioMixer: Created new WAV buffer with proper header');
          }
        } catch (conversionError) {
          console.error('AudioMixer: Error converting base64 to array buffer:', conversionError);
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

      // Add visible indication that audio is being played
      const audioIndicator = document.createElement('div');
      audioIndicator.innerHTML = '🔊 Playing Audio...';
      audioIndicator.style.position = 'fixed';
      audioIndicator.style.bottom = '20px';
      audioIndicator.style.right = '20px';
      audioIndicator.style.backgroundColor = 'rgba(0,0,0,0.7)';
      audioIndicator.style.color = 'white';
      audioIndicator.style.padding = '10px';
      audioIndicator.style.borderRadius = '5px';
      audioIndicator.style.zIndex = '9999';
      document.body.appendChild(audioIndicator);

      // Decode the audio data
      console.log('AudioMixer: Decoding audio data...');
      
      // Try different decoding approaches
      let audioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      } catch (decodeError) {
        console.warn('AudioMixer: Standard decoding failed, trying legacy callback approach:', decodeError);
        
        // Try legacy callback approach as fallback
        audioBuffer = await new Promise((resolve, reject) => {
          this.audioContext.decodeAudioData(
            arrayBuffer, 
            (buffer) => resolve(buffer),
            (err) => reject(new Error('Legacy decoding failed: ' + err))
          );
        });
      }
      
      console.log('AudioMixer: Audio data decoded successfully, creating source...');
      
      // Create a buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect to destination (speakers)
      source.connect(this.audioContext.destination);
      
      // Play the audio
      source.start(0);
      
      console.log('AudioMixer: Playing translated audio:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels
      });
      
      return new Promise((resolve) => {
        source.onended = () => {
          console.log('AudioMixer: Audio playback completed');
          if (document.body.contains(audioIndicator)) {
            document.body.removeChild(audioIndicator);
          }
          resolve();
        };
        
        // Safety timeout in case onended doesn't fire
        setTimeout(() => {
          console.log('AudioMixer: Playback timeout reached');
          if (document.body.contains(audioIndicator)) {
            document.body.removeChild(audioIndicator);
          }
          resolve();
        }, (audioBuffer.duration * 1000) + 2000); // Audio duration + 2 seconds buffer
      });
    } catch (error) {
      console.error('AudioMixer: Error playing translated audio:', error);
      
      // Fallback method: Try using HTML Audio element instead
      console.log('AudioMixer: Attempting fallback audio playback using HTML Audio element');
      
      try {
        if (typeof audioData === 'string') {
          console.log('AudioMixer: Creating HTML Audio element with base64 data');
          const audioElement = new Audio(`data:audio/wav;base64,${audioData}`);
          
          // Log when audio can play
          audioElement.addEventListener('canplaythrough', () => {
            console.log('AudioMixer: Audio can play through now');
          });
          
          // Log errors
          audioElement.addEventListener('error', (e) => {
            console.error('AudioMixer: Audio element error:', e.target.error);
          });
          
          // Return a promise that resolves when audio finishes playing
          return new Promise((resolve) => {
            audioElement.addEventListener('ended', () => {
              console.log('AudioMixer: Audio playback completed (fallback method)');
              resolve();
            });
            
            // Fallback if ended doesn't fire
            setTimeout(() => {
              console.log('AudioMixer: Fallback timeout reached');
              resolve();
            }, 10000); // 10 second fallback
            
            // Play the audio
            console.log('AudioMixer: Attempting to play with Audio element');
            audioElement.play()
              .then(() => console.log('AudioMixer: Fallback audio playback started'))
              .catch(err => {
                console.error('AudioMixer: Fallback audio playback failed:', err);
                resolve(); // Resolve anyway to prevent hanging
              });
          });
        }
      } catch (fallbackError) {
        console.error('AudioMixer: Fallback audio playback failed:', fallbackError);
      }
      
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