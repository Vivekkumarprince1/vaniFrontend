/**
 * Utility for handling call sounds like ringtones using AudioContext
 */

class CallSoundPlayer {
  constructor() {
    this.audioContext = null;
    this.ringtoneInterval = null;
    this.ringbackInterval = null;
    this.isPlaying = false;
    this.isInitialized = false;
    this.initialize();
  }

  initialize() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.isInitialized = true;
      console.log('Audio context initialized successfully');
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  }

  // Generate a beep tone
  generateTone(frequency, duration) {
    if (!this.isInitialized) this.initialize();
    if (!this.audioContext) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gainNode.gain.value = 0.5;
      
      oscillator.start();
      
      setTimeout(() => {
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
      }, duration);
      
      return { oscillator, gainNode };
    } catch (error) {
      console.error('Error generating tone:', error);
      return null;
    }
  }

  // Play ringtone for incoming calls (receiver side)
  playRingtone() {
    if (this.isPlaying) this.stopAll();
    this.isPlaying = true;
    
    console.log('Playing ringtone...');
    
    try {
      // Ensure audio context is running
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // Create a ringtone pattern - two tones repeating
      let count = 0;
      this.ringtoneInterval = setInterval(() => {
        if (!this.isPlaying) return;
        
        // First tone
        this.generateTone(880, 300);
        
        // Second tone after a short delay
        setTimeout(() => {
          if (!this.isPlaying) return;
          this.generateTone(950, 300);
        }, 350);
        
        count++;
        if (count > 50) {
          // Safety - stop after ~25 seconds
          this.stopAll();
        }
      }, 1500); // Repeat every 1.5 seconds
      
      // Create a button to help with browser autoplay policies
      this._createSoundUnlockButton('Answer incoming call', () => {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
          // Play one tone immediately after user interaction
          this.generateTone(880, 300);
        }
      });
    } catch (error) {
      console.error('Error playing ringtone:', error);
    }
  }

  // Play ringback tone for outgoing calls (caller side)
  playRingback() {
    if (this.isPlaying) this.stopAll();
    this.isPlaying = true;
    
    console.log('Playing ringback tone...');
    
    try {
      // Ensure audio context is running
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // Create a ringback pattern - one tone repeating with pause
      let count = 0;
      this.ringbackInterval = setInterval(() => {
        if (!this.isPlaying) return;
        
        this.generateTone(425, 1000);
        
        count++;
        if (count > 25) {
          // Safety - stop after ~25 seconds
          this.stopAll();
        }
      }, 3000); // Standard ringback is about 3 seconds between rings
      
      // Create a button to help with browser autoplay policies
      this._createSoundUnlockButton('Calling...', () => {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
          // Play one tone immediately after user interaction
          this.generateTone(425, 1000);
        }
      });
    } catch (error) {
      console.error('Error playing ringback tone:', error);
    }
  }

  // Play disconnect sound when call ends
  playDisconnect() {
    if (this.isPlaying) this.stopAll();
    
    console.log('Playing disconnect sound...');
    
    try {
      // Ensure audio context is running
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // Generate a disconnect sound (three descending tones)
      this.generateTone(660, 150);
      
      setTimeout(() => this.generateTone(600, 150), 150);
      
      setTimeout(() => this.generateTone(500, 150), 300);
    } catch (error) {
      console.error('Error playing disconnect sound:', error);
    }
  }

  // Play answer sound when call is connected
  playAnswer() {
    if (this.isPlaying) this.stopAll();
    
    console.log('Playing answer sound...');
    
    try {
      // Ensure audio context is running
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // Generate a pleasant answer sound (two ascending tones)
      this.generateTone(500, 150);
      
      setTimeout(() => this.generateTone(600, 150), 150);
      
      setTimeout(() => this.generateTone(700, 200), 300);
    } catch (error) {
      console.error('Error playing answer sound:', error);
    }
  }

  // Stop all sounds
  stopAll() {
    this.isPlaying = false;
    
    try {
      console.log('Stopping all sounds...');
      
      // Clear ringtone interval with multiple attempts
      if (this.ringtoneInterval) {
        clearInterval(this.ringtoneInterval);
        this.ringtoneInterval = null;
      }
      
      // Extra clearInterval call with the same ID as a safety measure
      if (typeof this.ringtoneInterval === 'number') {
        window.clearInterval(this.ringtoneInterval);
      }
      
      // Clear ringback interval
      if (this.ringbackInterval) {
        clearInterval(this.ringbackInterval);
        this.ringbackInterval = null;
      }
      
      // Extra clearInterval call with the same ID as a safety measure
      if (typeof this.ringbackInterval === 'number') {
        window.clearInterval(this.ringbackInterval);
      }
      
      console.log('All sounds stopped');
    } catch (error) {
      console.error('Error stopping sounds:', error);
    }
  }

  // Clean up resources
  cleanup() {
    this.stopAll();
    
    if (this.audioContext) {
      this.audioContext.close().catch(err => {
        console.warn('Error closing audio context:', err);
      });
      this.audioContext = null;
    }
    
    this.isInitialized = false;
    console.log('Call sound player cleaned up');
  }
}

// Create singleton instance
const callSoundPlayer = new CallSoundPlayer();

// Add a global click handler to help with autoplay restrictions
document.addEventListener('click', function unlockAudio() {
  if (callSoundPlayer.audioContext && callSoundPlayer.audioContext.state === 'suspended') {
    callSoundPlayer.audioContext.resume().then(() => {
      console.log('AudioContext resumed by user interaction');
    });
  }
  document.removeEventListener('click', unlockAudio);
}, { once: true });

// Add a global event listener for emergency sound stopping
document.addEventListener('vani-stop-all-sounds', function() {
  console.log('Global sound stop triggered');
  callSoundPlayer.stopAll();
});

export default callSoundPlayer; 