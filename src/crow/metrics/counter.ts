import { Metric } from "./metric";
import { MetricName, MetricType } from "../metric_name";

export class Counter extends Metric<Counter> {
  public value: number = 0;

  constructor(public name: MetricName) {
    super(name, MetricType.Counter);
    // pass.
  }

  increment(count: number = 1): void {
    this.value += count;
  }

  save(snapshot: Map<MetricName, number>): void {
    snapshot.set(this.name, this.value);
  }
}
