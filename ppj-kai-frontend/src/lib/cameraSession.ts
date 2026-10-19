/** Owns streams even when a pending permission request resolves after a dialog closes. */
export class CameraSession {
  stream: MediaStream | null = null;
  private generation = 0;
  async open(request: () => Promise<MediaStream>): Promise<MediaStream | null> {
    this.stop();
    const generation = this.generation;
    const stream = await request();
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return null; }
    this.stream = stream;
    return stream;
  }
  stop() { this.generation++; this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; }
}
