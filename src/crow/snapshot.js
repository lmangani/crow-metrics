"use strict";

/*
 * Snapshot of the values of every metric in the system at a given time.
 * The snapshot is exposed in raw form as `map`, a Map of metric objects to
 * values, where the value may be a `Number` or `Map(String -> Number)`.
 */
export default class Snapshot {
  constructor(timestamp, map) {
    this.timestamp = timestamp;
    this.map = map;
  }

  /*
   * Return a flattened map of `String -> Value`. The default formatter will
   * create an OpenTSDB-style name, like `name{tag=value,tag=value}`, and
   * attach any subkey as an extra tag named "p".
   *   - formatter: `(name, tags, subkey) -> String`
   *
   * The value of each map entry will be an object with:
   *   - value: the metric value, as a Number
   *   - type: the lowercase name of the metric type, as a String ("gauge",
   *     "counter", or "distribution")
   */
  flatten(formatter) {
    if (!formatter) formatter = (name, tags, subkey) => {
      if (subkey) tags = tags.merge({ p: subkey });
      return name + tags.canonical;
    };

    const map = new Map();
    for (const [ metric, value ] of this.map) {
      if (value == null || value === undefined) continue;
      if (typeof value == "number") {
        map.set(formatter(metric.name, metric.tags), { value, type: metric.type });
      } else {
        for (const [ k, v ] of value) {
          map.set(formatter(metric.name, metric.tags, k), { value: v, type: metric.type });
        }
      }
    }
    return map;
  }
}
