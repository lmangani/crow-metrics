import { BiasedQuantileDistribution } from "../bqdist";
import { Gauge } from "./gauge";
import { Metric } from "./metric";
import { MetricName, MetricType } from "../metric_name";

/*
 * A distribution collects samples over a time period, and then summarizes
 * them based on percentiles requested (median, 90th percentile, and so on).
 */
export class Distribution extends Metric<Distribution> {
  private distribution: BiasedQuantileDistribution;
  private percentileGauges: MetricName[];
  private countGauge: MetricName;
  private sumGauge: MetricName;

  constructor(name: MetricName, public percentiles: number[], public error: number) {
    super(name, MetricType.Distribution);
    this.distribution = new BiasedQuantileDistribution(percentiles, error);

    const baseGauge = name.withType(MetricType.Gauge);
    this.percentileGauges = percentiles.map(p => baseGauge.addTag("p", p.toString()));
    this.countGauge = baseGauge.addTag("p", "count");
    this.sumGauge = baseGauge.addTag("p", "sum");
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
    const data = this.distribution.snapshot();
    this.distribution.reset();
    if (data.sampleCount == 0) return;
    for (let i = 0; i < this.percentiles.length; i++) {
      snapshot.set(this.percentileGauges[i], data.getPercentile(this.percentiles[i]));
    }
    snapshot.set(this.countGauge, data.sampleCount);
    snapshot.set(this.sumGauge, data.sampleSum);
  }
}
