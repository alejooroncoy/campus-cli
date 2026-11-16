// Copia el micrófono para el texto en vivo de Mis clases.
// Corre en el hilo de audio: sigue recibiendo muestras aunque la página esté en segundo plano
// o el hilo principal vaya lento. Envía bloques de ~100 ms; el hilo principal los agrupa en ventanas.
class ClassLiveTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate / 10);
    this.buffer = new Float32Array(this.size);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.filled++] = channel[i];
        if (this.filled === this.size) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(this.size);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('class-live-tap', ClassLiveTap);
