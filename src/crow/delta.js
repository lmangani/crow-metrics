"use strict";

import Snapshot from "./snapshot";

class DeltaObserver {
  constructor() {
    this.previous = new Map();
  }

  compute(snapshot) {
    const map = new Map();
    for (const [ metric, value ] of snapshot.map) {
      if (metric.type == "counter") {
        const key = metric.name + "{" + metric.tags.canonical + "}";
        const delta = value - (this.previous.get(key) || 0);
        this.previous.set(key, value);
        map.set(metric, delta);
      } else {
        // pass-thru.
        map.set(metric, value);
      }
    }
    return new Snapshot(snapshot.timestamp, map);
  }
}

/*
 * Convert "counter" metrics into deltas, so that the resulting snapshot is
 * entirely made up of (gauge-like) simultaneous values.
 *
 * Pass in an observer function that will receive the delta'd snapshots as
 * they are emitted. Returns a wrapped observer that takes normal snapshots.
 */
export default function deltaObserver(observer) {
  const d = new DeltaObserver();
  return snapshot => observer(d.compute(snapshot));
}
