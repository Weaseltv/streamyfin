export type MediaVolume = { volume: number; type?: string };
type Listener = (volume: number, initial: boolean) => void;

/** One native subscription per playback session; chrome uses logical subscribers. */
export class MediaVolumeSession {
  private listeners = new Set<Listener>();
  private value: number | undefined;
  private epoch = 0;
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    if (this.value !== undefined) listener(this.value, true);
    return () => {
      this.listeners.delete(listener);
    };
  }
  start(driver: {
    getVolume(): Promise<MediaVolume>;
    addVolumeListener(listener: (event: MediaVolume) => void): {
      remove(): void;
    };
  }) {
    const epoch = ++this.epoch;
    let events = 0;
    this.value = undefined;
    const emit = (event: MediaVolume, seed: boolean) => {
      if (
        this.epoch !== epoch ||
        (event.type && event.type !== "music") ||
        !Number.isFinite(event.volume)
      )
        return;
      const initial = seed || this.value === undefined;
      this.value = event.volume;
      for (const listener of this.listeners) listener(event.volume, initial);
    };
    const native = driver.addVolumeListener((event) => {
      if (event.type && event.type !== "music") return;
      events++;
      emit(event, false);
    });
    void driver
      .getVolume()
      .then((event) => {
        if (events === 0) emit(event, true);
      })
      .catch(() => {});
    return () => {
      if (this.epoch === epoch) {
        this.epoch++;
        this.value = undefined;
      }
      native.remove();
    };
  }
}
