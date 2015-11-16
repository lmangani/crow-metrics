"use strict";

// one hour
const DEFAULT_SPAN = 60 * 60 * 1000;

// store metrics in a ring buffer for some amount of time (by default, one hour)
export default class RingBufferObserver {
  constructor(options = {}) {
    this.span = options.span || DEFAULT_SPAN;
    this.size = 0;
    this.buffer = null;
  }

  get observer() {
    return snapshot => {
      // initialize if necessary.
      if (this.buffer == null) {
        this.size = Math.round(this.span / snapshot.registry.period);
        this.buffer = new Array(this.size);
        this.index = 0;
      }

      this.buffer[this.index] = snapshot;
      this.index = (this.index + 1) % this.size;
    };
  }

  get() {
    if (this.buffer == null) return [];
    const rv = [];
    for (let i = 0; i < this.size; i++) {
      const record = this.buffer[(this.index + i) % this.size];
      if (record) rv.push(record);
    }
    return rv;
  }

  getLatest() {
    if (this.buffer == null) return {};
    return this.buffer[(this.index + this.size - 1) % this.size];
  }

  toJson() {
    const records = this.get();

    const nameSet = new Set();
    records.forEach(record => {
      for (const name of record.flatten().keys()) nameSet.add(name);
    });
    const names = Array.from(nameSet).sort();

    const json = { "@timestamp": [] };
    names.forEach(name => json[name] = []);
    const previousCounters = new Map();

    records.forEach(record => {
      const seen = new Set();
      json["@timestamp"].push(record.timestamp);
      for (const [ name, { value, type } ] of record.flatten()) {
        seen.add(name);
        if (type == "counter") {
          // skip first data point so we can report deltas instead.
          const previous = previousCounters.get(name);
          json[name].push(previous ? value - previous : null);
          previousCounters.set(name, value);
        } else {
          json[name].push(value);
        }
      }
      names.forEach(name => {
        if (!seen.has(name)) json[name].push(null);
      });
    });

    return json;
  }
}
