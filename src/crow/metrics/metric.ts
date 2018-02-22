import { MetricName, MetricType } from "../metric_name";

/*
 * Common base class for all metrics (implementation detail).
 */
export abstract class Metric<A extends Metric<A>> {
  private lastUpdated: number = 0;

  constructor(public name: MetricName, public type: MetricType) {
    // pass.
  }

  touch(time: number) {
    this.lastUpdated = time;
  }

  isExpired(timestamp: number, expire: number): boolean {
    return timestamp - this.lastUpdated >= expire;
  }

  // save current value(s) into a snapshot.
  abstract save(snapshot: Map<MetricName, number>): void;
}
