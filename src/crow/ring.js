"use strict";

const MetricType = require("./metrics").MetricType;
const util = require("util");

// one hour
const DEFAULT_SPAN = 60 * 60 * 1000;

// store metrics in a ring buffer for some amount of time (by default, one hour)
class RingBufferObserver {
  constructor(registry, span = DEFAULT_SPAN) {
    this.span = span;
    if (registry != null) this.register(registry);
  }

  register(registry) {
    this.size = Math.round(this.span / registry.period);
    this.buffer = new Array(this.size);
    this.index = 0;

    registry.addObserver((timestamp, snapshot) => {
      this.buffer[this.index] = { timestamp, snapshot };
      this.index = (this.index + 1) % this.size;
    });
  }

  get() {
    let rv = [];
    for (let i = 0; i < this.size; i++) {
      let record = this.buffer[(this.index + i + 1) % this.size];
      if (record) rv.push(record);
    }
    return rv;
  }

  getLatest() {
    return this.buffer[(this.index + this.size - 1) % this.size];
  }

  toJson() {
    const records = this.get();

    const nameSet = {};
    records.forEach((record) => {
      Object.keys(record.snapshot).forEach((name) => {
        if (name[0] != "@") nameSet[name] = true;
      });
    });
    const names = Object.keys(nameSet).sort();

    const json = { "@timestamp": [] };
    names.forEach((name) => json[name] = []);
    const previously = {};

    records.forEach((record) => {
      const seen = {};
      json["@timestamp"].push(record.timestamp);
      Object.keys(record.snapshot).forEach((name) => {
        if (name[0] != "@") {
          let value = record.snapshot[name];
          if (record.snapshot["@types"][name] == MetricType.COUNTER) {
            value = value - (previously[name] || 0);
            previously[name] = record.snapshot[name];
          }
          json[name].push(value);
          seen[name] = true;
        }
      });
      names.forEach((name) => {
        if (!seen[name]) json[name].push(null);
      });
    });

    return json;
  }
}


exports.DEFAULT_SPAN = DEFAULT_SPAN;
exports.RingBufferObserver = RingBufferObserver;
