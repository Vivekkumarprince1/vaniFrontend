import socketManager from '../utils/socketManager';
import webrtcService from './webrtcServices';

class CallService {
    constructor() {
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        socketManager.on('incomingCall', this.handleIncomingCall);
        socketManager.on('callEnded', this.handleCallEnded);
        socketManager.on('offer', this.handleOffer);
        socketManager.on('answer', this.handleAnswer);
        socketManager.on('iceCandidate', this.handleIceCandidate);
    }

    async startCall(targetId, type = 'video', callerInfo) {
        try {
            const success = await webrtcService.startCall(targetId, type);
            if (success) {
                socketManager.emit('startCall', {
                    targetId,
                    type,
                    callerInfo
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error starting call:', error);
            return false;
        }
    }

    async answerCall(incomingCall) {
        try {
            const success = await webrtcService.answerCall(incomingCall);
            if (success) {
                socketManager.emit('callAnswered', {
                    targetId: incomingCall.from
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error answering call:', error);
            return false;
        }
    }

    endCall() {
        webrtcService.endCall();
        socketManager.emit('endCall');
    }

    toggleMute() {
        return webrtcService.toggleMute();
    }

    toggleCamera() {
        return webrtcService.toggleCamera();
    }

    handleIncomingCall = (data) => {
        return {
            offer: data.offer,
            type: data.type,
            from: data.from,
            caller: data.caller
        };
    }

    handleCallEnded = () => {
        webrtcService.endCall();
        return true;
    }

    handleOffer = async ({ offer, from, type }) => {
        try {
            await webrtcService.handleOffer(offer, from, type);
            return true;
        } catch (error) {
            console.error('Error handling offer:', error);
            return false;
        }
    }

    handleAnswer = async ({ answer }) => {
        try {
            await webrtcService.handleAnswer(answer);
            return true;
        } catch (error) {
            console.error('Error handling answer:', error);
            return false;
        }
    }

    handleIceCandidate = async ({ candidate }) => {
        try {
            await webrtcService.handleIceCandidate(candidate);
            return true;
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
            return false;
        }
    }

    cleanup() {
        socketManager.off('incomingCall');
        socketManager.off('callEnded');
        socketManager.off('offer');
        socketManager.off('answer');
        socketManager.off('iceCandidate');
        webrtcService.endCall();
    }
}

export default new CallService(); 