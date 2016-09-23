import { MetricType } from "./metric_name";
import { Snapshot } from "./snapshot";
import { Observer } from "./metrics";

export interface DeltaObserverOptions {

}

/*
 * Convert "counter" metrics into deltas, so that the resulting snapshot is
 * entirely made up of (gauge-like) simultaneous values.
 *
 * Pass in an observer function that will receive the delta'd snapshots as
 * they are emitted. Returns a wrapped observer that takes normal snapshots.
 */
export class DeltaObserver {
  observers: Observer[] = [];

  // previous values for counters
  previous = new Map<string, number>();

  constructor(public options: DeltaObserverOptions = {}) {
    // this.rank = options.rank || [];
    // convert 'match' into a regex, and 'tags' into a form suitable for merging.
    // this.rank.forEach(r => {
    //   if (!r.match) r.match = ".*";
    //   if (typeof r.match == "string") r.match = new RegExp(r.match);
    //   r.mergeTags = {};
    //   r.tags.forEach(t => r.mergeTags[t] = null);
    // });
  }

  compute(snapshot: Snapshot) {
    const map = new Map();
    const newDistributions = new Set();

    for (const [ metric, value ] of snapshot.map) {
      let newValue = value;

      if (metric.type == MetricType.Counter) {
        newValue = value - (this.previous.get(metric.canonical) || 0);
        this.previous.set(metric.canonical, value);
      }

      // let squelch = false;
//       this.rank.forEach(r => {
//         if (r.match.test(metric.name) && metric.type != "distribution") {
//           squelch = true;
//           const newName = r.name || metric.name;
//           const newTags = metric.tags.merge(r.mergeTags);
//           const d = snapshot.registry.distribution(newName, newTags, r.percentiles, r.error);
//           d.add(newValue);
//           newDistributions.add(d);
//         }
//       });
//
      map.set(metric, newValue);
    }

    // remove state for anything that's been wiped out.
    const currentKeys = new Set();
    for (const metric of snapshot.map.keys()) currentKeys.add(metric.canonical);
    for (const key of this.previous.keys()) if (!currentKeys.has(key)) this.previous.delete(key);

//     // add any new distributions we computed.
//     for (const d of newDistributions) map.set(d, d.value);

    return new Snapshot(snapshot.registry, snapshot.timestamp, map);
  }

  addObserver(observer: Observer): void {
    this.observers.push(observer);
  }

  get observer() {
    return (snapshot: Snapshot) => {
      const transformed = this.compute(snapshot);
      this.observers.forEach(x => {
        try {
          x(transformed);
        } catch (error) {
          console.log(error.stack);
        }
      });
    };
  }
}
