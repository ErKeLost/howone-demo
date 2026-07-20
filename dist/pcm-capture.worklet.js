const TARGET_SAMPLE_RATE = 16000
const FRAME_SAMPLES = 320

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.inputSamples = []
    this.outputSamples = []
    this.readOffset = 0
    this.ratio = sampleRate / TARGET_SAMPLE_RATE
  }

  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input?.length) return true

    for (let index = 0; index < input.length; index += 1) this.inputSamples.push(input[index])

    while (this.readOffset + this.ratio <= this.inputSamples.length) {
      const start = Math.floor(this.readOffset)
      const end = Math.max(start + 1, Math.floor(this.readOffset + this.ratio))
      let sum = 0
      for (let index = start; index < end; index += 1) sum += this.inputSamples[index]
      this.outputSamples.push(sum / (end - start))
      this.readOffset += this.ratio

      if (this.outputSamples.length === FRAME_SAMPLES) {
        const pcm = new Int16Array(FRAME_SAMPLES)
        for (let index = 0; index < FRAME_SAMPLES; index += 1) {
          const sample = Math.max(-1, Math.min(1, this.outputSamples[index]))
          pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }
        this.port.postMessage(pcm.buffer, [pcm.buffer])
        this.outputSamples = []
      }
    }

    const consumed = Math.floor(this.readOffset)
    if (consumed > 0) {
      this.inputSamples.splice(0, consumed)
      this.readOffset -= consumed
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
