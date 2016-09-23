import { MetricName, MetricType, Tags } from "./metric_name";
import { Counter } from "./metrics/counter";
import { Distribution } from "./metrics/distribution";
import { Gauge } from "./metrics/gauge";
import { Snapshot } from "./snapshot";

export { Counter, Distribution, Gauge };

export type Observer = (snapshot: Snapshot) => void;

/*
 * Basic interface for anything that wants to collect metrics.
 */
export interface Metrics {
  /*
   * Find or create a counter with the given name and optional tags.
   */
  counter(name: string, tags?: Tags): MetricName<Counter>;

  /*
   * Find or create a gauge with the given name and optional tags.
   */
  gauge(name: string, tags?: Tags): MetricName<Gauge>;

  /*
   * Find or create a distribution with the given name and optional tags.
   */
  distribution(
    name: string,
    tags?: Tags,
    percentiles?: number[],
    error?: number
  ): MetricName<Distribution>;

  /*
   * Increment a counter. If the counter doesn't exist yet, it's created.
   */
  increment(name: MetricName<Counter>, count?: number): void;

  /*
   * Add (or replace) a gauge with the given name.
   * The getter is normally a function that computes the value on demand,
   * but if the value changes rarely or never, you may use a constant value
   * instead.
   */
  setGauge(name: MetricName<Gauge>, getter: number | (() => number)): void;

  /*
   * Remove a gauge.
   */
  removeGauge(name: MetricName<Gauge>): void;

  /*
   * Add a data point (or array of data points) to a distribution.
   */
  addDistribution(name: MetricName<Distribution>, data: number | number[]): void;

  /*
   * Time a function call (in milliseconds) and record it as a data point in
   * a distribution. Exceptions are not recorded.
   */
  time<T>(name: MetricName<Distribution>, f: () => T): T;

  /*
   * Time a function call that returns a promise (in milliseconds) and
   * record it as a data point in a distribution. Rejected promises are not
   * recorded.
   */
  timePromise<T>(name: MetricName<Distribution>, f: () => Promise<T>): Promise<T>;

  /*
   * Return a new Metrics object that represents the same registry, but
   * prefixes all names with `(prefix)(this.separator)`.
   */
  withPrefix(prefix: string): Metrics;
}
