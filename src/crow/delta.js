"use strict";

import Snapshot from "./snapshot";

class DeltaObserver {
  constructor(options = {}) {
    this.previous = new Map();
    this.rank = options.rank || [];
    // convert 'match' into a regex, and 'tags' into a form suitable for merging.
    this.rank.forEach(r => {
      if (!r.match) r.match = ".*";
      if (typeof r.match == "string") r.match = new RegExp(r.match);
      r.mergeTags = {};
      r.tags.forEach(t => r.mergeTags[t] = null);
    });
  }

  compute(snapshot) {
    const map = new Map();
    const newDistributions = new Set();

    for (const [ metric, value ] of snapshot.map) {
      let newValue = value;

      if (metric.type == "counter") {
        const key = metric.name + "{" + metric.tags.canonical + "}";
        const delta = value - (this.previous.get(key) || 0);
        this.previous.set(key, value);
        newValue = delta;
      }

      let squelch = false;
      this.rank.forEach(r => {
        if (r.match.test(metric.name)) {
          squelch = true;
          const newName = r.name || metric.name;
          const newTags = metric.tags.merge(r.mergeTags);
          const d = snapshot.registry.distribution(newName, newTags);
          d.add(newValue);
          newDistributions.add(d);
        }
      });

      if (!squelch) map.set(metric, newValue);
    }

    // add any new distributions we computed.
    for (const d of newDistributions) map.set(d, d.value);

    return new Snapshot(snapshot.registry, snapshot.timestamp, map);
  }
}

/*
 * Convert "counter" metrics into deltas, so that the resulting snapshot is
 * entirely made up of (gauge-like) simultaneous values.
 *
 * Pass in an observer function that will receive the delta'd snapshots as
 * they are emitted. Returns a wrapped observer that takes normal snapshots.
 */
export default function deltaObserver(observer, options) {
  const d = new DeltaObserver(options);
  return snapshot => observer(d.compute(snapshot));
}
