import { Metric } from "./metrics/metric";
import { MetricName } from "./metric_name";
import { MetricsRegistry } from "./registry";

/*
 * Snapshot of the values of every metric in the system at a given time.
 * The snapshot is exposed in raw form as `map`, a Map of metric objects to
 * values, where the value may be a `Number` or `Map(String -> Number)`.
 */
export class Snapshot {
  constructor(public registry: MetricsRegistry, public timestamp: number, public map: Map<MetricName<Metric>, number>) {
    // pass.
  }

  /*
   * Return a flattened `Map<string, number>` that converts each MetricName
   * into a string, using the provided formatter. The default formatter
   * generates the canonical (OpenTSDB-style) name, like
   * `name{tag=value,tag=value}`.
   */
  flatten(
    formatter: ((name: MetricName<Metric>) => string) = (name: MetricName<Metric>) => name.format()
  ): Map<string, number> {
    const map = new Map();
    for (const [ metric, value ] of this.map) {
      if (value == null || value === undefined) continue;
      map.set(formatter(metric), value);
    }
    return map;
  }

  // for debugging and tests
  toString() {
    const map = this.flatten();
    return "Snapshot(" + Array.from(map.keys()).sort().map(key => `${key}=${map.get(key)}`).join(", ") + ")";
  }
}
