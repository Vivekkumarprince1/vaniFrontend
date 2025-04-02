import socketManager from '../utils/socketManager';

class WebRTCService {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
    }

    async setupWebRTC() {
        try {
            if (this.peerConnection) {
                this.peerConnection.close();
            }

            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10,
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                iceTransportPolicy: 'all',
                sdpSemantics: 'unified-plan',
                rtcAudioJitterBufferMaxPackets: 500,
                rtcAudioJitterBufferFastAccelerate: true
            });

            const newRemoteStream = new MediaStream();
            this.remoteStream = newRemoteStream;

            pc.ontrack = (event) => {
                if (event.track.kind === 'video') {
                    newRemoteStream.addTrack(event.track);
                }
            };

            pc.addTransceiver('audio', {
                direction: 'sendrecv',
                streams: [newRemoteStream]
            });

            pc.onconnectionstatechange = () => {
                console.log('Connection state:', pc.connectionState);
                if (pc.connectionState === 'disconnected') {
                    console.log('WebRTC connection disconnected, attempting to recover...');
                } else if (['failed', 'closed'].includes(pc.connectionState)) {
                    console.log('WebRTC connection failed or closed');
                    this.endCall();
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socketManager.emit('iceCandidate', {
                        candidate: event.candidate
                    });
                }
            };

            pc.onicegatheringstatechange = () => {
                console.log('ICE gathering state:', pc.iceGatheringState);
            };

            pc.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', pc.iceConnectionState);
                if (pc.iceConnectionState === 'failed') {
                    pc.restartIce();
                }
            };

            this.peerConnection = pc;
            return pc;
        } catch (error) {
            console.error('Error setting up WebRTC:', error);
            throw error;
        }
    }

    async getOptimizedUserMedia(type = 'video') {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            },
            video: type === 'video' ? {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 24, max: 30 },
                facingMode: 'user'
            } : false
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            stream.getAudioTracks().forEach(track => {
                try {
                    if ('applyConstraints' in track) {
                        track.applyConstraints({
                            echoCancellation: true,
                            noiseSuppression: true
                        });
                    }
                } catch (constraintErr) {
                    console.warn('Could not apply additional audio constraints:', constraintErr);
                }
            });

            return stream;
        } catch (error) {
            console.error('Error getting user media:', error);
            throw error;
        }
    }

    async startCall(targetId, type = 'video') {
        try {
            this.endCall();
            const pc = await this.setupWebRTC();
            const stream = await this.getOptimizedUserMedia(type);
            this.localStream = stream;

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });

            await pc.setLocalDescription(offer);

            await new Promise(resolve => {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkState, 500);
                    }
                };
                const timeout = setTimeout(() => resolve(), 3000);
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                checkState();
            });

            socketManager.emit('offer', {
                targetId,
                offer: pc.localDescription,
                type
            });

            return true;
        } catch (error) {
            console.error('Error in startCall:', error);
            this.handleCallError(error);
            this.endCall();
            return false;
        }
    }

    async answerCall(incomingCall) {
        try {
            this.endCall();
            const pc = await this.setupWebRTC();
            const stream = await this.getOptimizedUserMedia(incomingCall.type);
            this.localStream = stream;

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await new Promise(resolve => {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkState, 500);
                    }
                };
                const timeout = setTimeout(() => resolve(), 3000);
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                checkState();
            });

            socketManager.emit('answer', {
                targetId: incomingCall.from,
                answer: pc.localDescription
            });

            return true;
        } catch (error) {
            console.error('Error in answerCall:', error);
            this.handleCallError(error);
            this.endCall();
            return false;
        }
    }

    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.peerConnection) {
            this.peerConnection.ontrack = null;
            this.peerConnection.onicecandidate = null;
            this.peerConnection.oniceconnectionstatechange = null;
            this.peerConnection.onsignalingstatechange = null;
            this.peerConnection.onicegatheringstatechange = null;
            this.peerConnection.onnegotiationneeded = null;
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.remoteStream = null;
    }

    handleCallError(error) {
        if (error.name === 'NotAllowedError') {
            alert('Please allow access to your camera and microphone to make calls.');
        } else if (error.name === 'NotFoundError') {
            alert('No camera or microphone found. Please check your devices.');
        } else {
            alert('Could not start call. Please check your camera/microphone permissions.');
        }
    }

    toggleMute() {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            return !this.localStream.getAudioTracks()[0].enabled;
        }
        return false;
    }

    toggleCamera() {
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            return !this.localStream.getVideoTracks()[0].enabled;
        }
        return false;
    }
}

export default new WebRTCService(); 