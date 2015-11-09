"use strict";

// one hour
const DEFAULT_SPAN = 60 * 60 * 1000;

// store metrics in a ring buffer for some amount of time (by default, one hour)
export default class RingBufferObserver {
  constructor(registry, span = DEFAULT_SPAN) {
    this.span = span;
    if (registry != null) this.register(registry);
  }

  register(registry) {
    this.size = Math.round(this.span / registry.period);
    this.buffer = new Array(this.size);
    this.index = 0;

    registry.addObserver(snapshot => {
      this.buffer[this.index] = snapshot;
      this.index = (this.index + 1) % this.size;
    });
  }

  get() {
    const rv = [];
    for (let i = 0; i < this.size; i++) {
      const record = this.buffer[(this.index + i + 1) % this.size];
      if (record) rv.push(record);
    }
    return rv;
  }

  getLatest() {
    return this.buffer[(this.index + this.size - 1) % this.size];
  }

  toJson() {
    const records = this.get();

    const nameSet = new Set();
    records.forEach(record => {
      for (const name in record.snapshot.flatten().keys()) nameSet.add(name);
    });
    const names = Array.from(nameSet).sort();

    const json = { "@timestamp": [] };
    names.forEach(name => json[name] = []);
    const previously = new Map();

    records.forEach(record => {
      const seen = new Set();
      json["@timestamp"].push(record.timestamp);
      for (const [ name, { value, type } ] in record.flatten()) {
        seen.add(name);
        if (type == "counter") {
          // skip first data point so we can report deltas instead.
          const previous = previously.get(name);
          json[name].push(previous ? value - previous : null);
          previous.set(name, value);
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
