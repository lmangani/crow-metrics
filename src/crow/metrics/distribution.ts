import { BiasedQuantileDistribution } from "../bqdist";
import { Metric } from "./metric";
import { MetricName, MetricType } from "../metric_name";

/*
 * A distribution collects samples over a time period, and then summarizes
 * them based on percentiles requested (median, 90th percentile, and so on).
 */
export class Distribution extends Metric {
  distribution: BiasedQuantileDistribution;

  constructor(name: MetricName, public percentiles: number[], public error: number) {
    super(name, MetricType.Distribution);
    this.distribution = new BiasedQuantileDistribution(percentiles, error);
  }

  /*
   * add one data point (or more, if an array) to the distribution.
   */
  add(data: number | number[]): void {
    if (Array.isArray(data)) {
      data.forEach(x => this.distribution.record(x));
    } else {
      this.distribution.record(data);
    }
  }

  save(snapshot: Map<MetricName, number>): void {
  }

//   get value() {
//     const snapshot = this.distribution.snapshot();
//     this.distribution.reset();
//     const rv = new Map();
//     if (snapshot.sampleCount == 0) return rv;
//     this.percentiles.forEach(p => {
//       rv.set(p.toString(), snapshot.getPercentile(p));
//     });
//     rv.set("count", snapshot.sampleCount);
//     rv.set("sum", snapshot.sampleSum);
//     return rv;
//   }
//
//   /*
//    * time a function call and record it (in milliseconds).
//    * if the function returns a promise, the recorded time will cover the time
//    * until the promise succeeds.
//    * exceptions (and rejected promises) are not recorded.
//    */
//   time(f) {
//     const startTime = Date.now();
//     const rv = f();
//     // you aren't going to believe this. the type of null is... "object". :(
//     if (rv != null && typeof rv === "object" && typeof rv.then === "function") {
//       return rv.then(rv2 => {
//         this.add(Date.now() - startTime);
//         return rv2;
//       });
//     } else {
//       this.add(Date.now() - startTime);
//       return rv;
//     }
//   }
}
