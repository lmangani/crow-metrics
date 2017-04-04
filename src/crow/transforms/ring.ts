// import DeltaObserver from "./delta";
import { Observer } from "rxjs";
import { Snapshot } from "../snapshot";

// one hour
const DEFAULT_SPAN = 60 * 60 * 1000;

export interface RingBufferObserverOptions {
  span?: number;
}

/*
 * Snapshot observer that preserves a buffer of snapshots for some amount of
 * time (by default, one hour). Can be combined with other transforms like
 * `deltaSnapshots`.
 *
 * Note: rxjs has a weird bug where, if this class implements Observer<T>,
 * rxjs will clone it without copying any of the state, and send events to
 * its lobotomized clone. So we attach an observer as an anonymous object
 * that rxjs can mangle at will.
 */
export class RingBufferObserver {
  private span: number = DEFAULT_SPAN;
  private size: number = 0;
  private index: number = 0;
  private buffer: Snapshot[] = [];

  observer: Observer<Snapshot>;

  constructor(options: RingBufferObserverOptions = {}) {
    if (options.span) this.span = options.span;
    this.observer = {
      next: (snapshot: Snapshot) => this.next(snapshot),
      error: (error: Error) => null,
      complete: () => null
    };
  }

  next(snapshot: Snapshot): void {
    // initialize if necessary.
    if (this.buffer.length == 0) {
      this.size = Math.round(this.span / snapshot.registry.period);
      this.buffer = new Array(this.size);
      this.index = 0;
    }

    this.buffer[this.index] = snapshot;
    this.index = (this.index + 1) % this.size;
  }

  error(error: Error): void {
    // pass.
  }

  complete(): void {
    // pass.
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

  /*
   *
   */

//   toJson() {
//     const records = this.get();
//
//     const nameSet = new Set();
//     records.forEach(record => {
//       for (const name of record.flatten().keys()) nameSet.add(name);
//     });
//     const names = Array.from(nameSet).sort();
//
//     const json = { "@timestamp": [] };
//     names.forEach(name => json[name] = []);
//
//     records.forEach(record => {
//       const seen = new Set();
//       json["@timestamp"].push(record.timestamp);
//       for (const [ name, { value } ] of record.flatten()) {
//         seen.add(name);
//         json[name].push(value);
//       }
//       names.forEach(name => {
//         if (!seen.has(name)) json[name].push(null);
//       });
//     });
//
//     return json;
//   }
}
