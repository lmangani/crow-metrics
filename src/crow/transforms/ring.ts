import { Listener } from "../events";
import { Snapshot } from "../snapshot";

// one hour
const DEFAULT_SPAN = 60 * 60 * 1000;

export interface RingBufferOptions {
  // how long to keep snapshots
  span?: number;
}

/*
 * Snapshot observer that preserves a buffer of snapshots for some amount of
 * time (by default, one hour). Can be combined with other transforms like
 * `deltaSnapshots`.
 */
export class RingBuffer implements Listener<Snapshot> {
  private span: number = DEFAULT_SPAN;
  private size: number = 0;
  private index: number = 0;
  private buffer: Snapshot[] = [];

  constructor(options: RingBufferOptions = {}) {
    if (options.span) this.span = options.span;
  }

  post(snapshot: Snapshot): void {
    // initialize if necessary.
    if (this.buffer.length == 0) {
      this.size = Math.round(this.span / snapshot.registry.period);
      this.buffer = new Array(this.size);
      this.index = 0;
    }

    this.buffer[this.index] = snapshot;
    this.index = (this.index + 1) % this.size;
  }

  get(): Snapshot[] {
    if (this.buffer == null) return [];
    const rv: Snapshot[] = [];
    for (let i = 0; i < this.size; i++) {
      const record = this.buffer[(this.index + i) % this.size];
      if (record) rv.push(record);
    }
    return rv;
  }

  getLatest(): Snapshot {
    if (this.buffer == null) throw new Error("No snapshots yet");
    return this.buffer[(this.index + this.size - 1) % this.size];
  }
}
