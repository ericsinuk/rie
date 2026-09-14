import { api } from './api.js'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

export class VoiceCall {
  constructor(localUserId, remoteUserId, onStateChange) {
    this.localUserId = localUserId
    this.remoteUserId = remoteUserId
    this.onStateChange = onStateChange
    this.pc = null
    this.localStream = null
    this.channel = null
    this.isCaller = false
    this.muted = false
  }

  async startCall() {
    this.isCaller = true
    this.onStateChange('calling')
    await this._setupPeer()
    await this._sendSignal('offer', await this.pc.createOffer())
    await this.pc.setLocalDescription(this.pc.localDescription)
  }

  async answerCall(offer) {
    this.isCaller = false
    await this._setupPeer()
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    await this._sendSignal('answer', answer)
    this.onStateChange('connected')
  }

  async handleAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer))
    this.onStateChange('connected')
  }

  async handleIceCandidate(candidate) {
    if (this.pc && candidate) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  async _setupPeer() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream))

    this.pc.onicecandidate = async ({ candidate }) => {
      if (candidate) await this._sendSignal('ice-candidate', candidate.toJSON())
    }

    this.pc.ontrack = ({ streams }) => {
      const audio = new Audio()
      audio.srcObject = streams[0]
      audio.play().catch(() => {})
    }

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.hangup()
      }
    }

    this._subscribeSignals()
  }

  _subscribeSignals() {
    this.channel = api.channel(`webrtc:${this.localUserId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'webrtc_signals',
        filter: `to_user=eq.${this.localUserId}`
      }, async ({ new: signal }) => {
        if (signal.from_user !== this.remoteUserId) return
        if (signal.signal_type === 'answer') await this.handleAnswer(signal.payload)
        if (signal.signal_type === 'ice-candidate') await this.handleIceCandidate(signal.payload)
        if (signal.signal_type === 'hangup') { this.onStateChange('ended'); this._cleanup() }
      })
      .subscribe()
  }

  async _sendSignal(type, payload) {
    await api.from('webrtc_signals').insert({
      from_user: this.localUserId,
      to_user: this.remoteUserId,
      signal_type: type,
      payload: typeof payload === 'object' ? payload : { data: payload }
    })
  }

  toggleMute() {
    if (!this.localStream) return
    this.muted = !this.muted
    this.localStream.getAudioTracks().forEach(t => { t.enabled = !this.muted })
    return this.muted
  }

  async hangup() {
    await this._sendSignal('hangup', {})
    this._cleanup()
    this.onStateChange('ended')
  }

  _cleanup() {
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop())
    if (this.pc) this.pc.close()
    if (this.channel) api.removeChannel(this.channel)
    this.pc = null; this.localStream = null; this.channel = null
  }
}

export function subscribeIncomingCalls(userId, onIncoming) {
  return api.channel(`calls:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'webrtc_signals',
      filter: `to_user=eq.${userId}`
    }, ({ new: signal }) => {
      if (signal.signal_type === 'offer') onIncoming(signal)
    })
    .subscribe()
}
