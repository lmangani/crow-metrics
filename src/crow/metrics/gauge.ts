import { Metric } from "./metric";
import { MetricName, MetricType } from "../metric_name";

export class Gauge extends Metric<Gauge> {
  constructor(name: MetricName, private getter: number | (() => number) = 0) {
    super(name, MetricType.Gauge);
  }

  set(getter: number | (() => number)) {
    this.getter = getter;
  }

  get value(): number {
    return (this.getter instanceof Function) ? this.getter() : this.getter;
  }

  save(snapshot: Map<MetricName, number>): void {
    if (this.getter == null) return;
    snapshot.set(this.name, this.value);
  }
}
