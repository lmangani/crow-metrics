import { Metric } from "./metrics/metric";
import { Counter, Distribution, Gauge, Metrics } from "./metrics";
// import DeltaObserver from "./delta";
import { MetricName, MetricType, Tags } from "./metric_name";
import { Snapshot } from "./snapshot";
import { EventSource } from "./source";

declare var require: any;

const DEFAULT_PERCENTILES = [ 0.5, 0.9, 0.99 ];
const DEFAULT_ERROR = 0.01;

export interface BunyanLike {
  error(data: any, text: string): void;
  info(text: string): void;
  trace(text: string): void;
}

export interface RegistryOptions {
  // default tags to apply to each metric:
  tags?: Tags;

  // what to use in `withPrefix`; default is "_"
  separator?: string;

  // default percentiles to track on distributions
  percentiles?: number[];

  // default error to allow on distribution ranks
  error?: number;

  // (msec) how often to send snapshots to observers
  period?: number;

  // (msec) stop reporting counters and distributions that haven't been touched in this long
  expire?: number;

  // bunyan(-like) logger for debugging
  log?: BunyanLike;
}

/*
 * A MetricsRegistry is the central coordinator for metrics collection and
 * dispersal. It tracks metrics in a single namespace, and periodically
 * takes a snapshot and sends it to any observers. (A typical observer might
 * push the metrics into riemann, influxdb, or prometheus.)
 *
 * Normally, you'd only create one of these, but it's perfectly valid to
 * create several and use them independently, if you want.
 *
 * Each metric object contains:
 *   - name
 *   - type (`this.constructor.name.toLowerCase()`)
 *   - tags
 *   - value: Number or Map(String -> Number)
 *
 * options:
 *   - log: bunyan logger for debugging
 */
export class MetricsRegistry implements Metrics {
  // metrics are stored by their "fully-qualified" name, using stringified tags.
  metrics: Map<string, Metric> = new Map();

  public events = new EventSource<Snapshot>();

  public percentiles: number[] = DEFAULT_PERCENTILES;
  public error: number = DEFAULT_ERROR;

  private baseMetric: MetricName<any> | null = null;
  private separator = "_";
  private currentTime = Date.now();
  private version = "?";
  private log: BunyanLike | null = null;

  private _period = 60000;
  private expire = 0;
  private periodRounding = 1;
  private lastPublish = Date.now();

  constructor(options: RegistryOptions = {}) {
    if (options.period) this._period = options.period;
    if (options.expire) this.expire = options.expire;
    if (options.percentiles) this.percentiles = options.percentiles;
    if (options.error) this.error = options.error;
    if (options.log) this.log = options.log;
    if (options.tags) {
      this.baseMetric = MetricName.create(MetricType.Gauge, "", options.tags, null, null);
    }
    if (options.separator) this.separator = options.separator;

    // if the period is a multiple of minute, 30 sec, 5 sec, or 1 sec, then
    // round the next publish time to that.
    this.periodRounding = 1;
    [ 60000, 30000, 15000, 10000, 5000, 1000 ].forEach(r => {
      if (this.periodRounding == 1 && this.period % r == 0) {
        this.periodRounding = r;
      }
    });

    this.schedulePublish();

    try {
      this.version = require("../../package.json").version;
    } catch (error) {
      // don't worry about it.
    }
    if (this.log) this.log.info(`crow-metrics ${this.version} started; period_sec=${this.period / 1000}`);
  }

  get period(): number {
    return this._period;
  }

  private schedulePublish(): void {
    const nextTime = Math.round((this.lastPublish + this.period) / this.periodRounding) * this.periodRounding;
    let duration = nextTime - Date.now();
    while (duration < 0) duration += this.period;
    setTimeout(() => this.publish(nextTime), duration);
  }

  // timestamp is optional. exposed for testing.
  publish(timestamp?: number): void {
    if (timestamp == null) timestamp = Date.now();
    this.currentTime = timestamp;
    if (this.expire) {
      for (const [ key, metric ] of this.metrics) {
        if (metric.type == MetricType.Gauge) continue;
        if (metric.isExpired(timestamp, this.expire)) this.metrics.delete(key);
      }
    }

    const snapshot = this.snapshot(timestamp);
    this.lastPublish = snapshot.timestamp;
    if (this.log) {
      this.log.trace(`Publishing ${this.metrics.size} metrics to ${this.events.subscriberCount} observers.`);
    }

    this.events.emit(snapshot);
    this.schedulePublish();
  }

  /*
   * Return a snapshot of the current value of each metric.
   * Distributions will be reset.
   */
  snapshot(timestamp: number = Date.now()) {
    const map = new Map<MetricName<Metric>, number>();
    // some metrics (distributions, for example) will write multiple values into the snapshot.
    for (const metric of this.metrics.values()) metric.save(map);
    return new Snapshot(this, timestamp, map);
  }

  counter(name: string, tags?: Tags): MetricName<Counter> {
    const maker = (x: MetricName<Counter>) => new Counter(x);
    const metricName = MetricName.create(MetricType.Counter, name, tags || null, this.baseMetric, maker);
    this.getOrMake(metricName);
    return metricName;
  }

  increment(name: MetricName<Counter>, count: number = 1): void {
    const counter = this.getOrMake(name);
    counter.increment(count);
    counter.touch(this.currentTime);
  }

  getCounter(name: MetricName<Counter>): number {
    return this.getOrMake(name).value;
  }

  gauge(name: string, tags?: Tags): MetricName<Gauge> {
    const metricName = MetricName.create(MetricType.Gauge, name, tags || null, this.baseMetric, (x: MetricName<Gauge>) => new Gauge(x));
    this.getOrMake(metricName);
    return metricName;
  }

  setGauge(name: MetricName<Gauge>, getter: number | (() => number)) {
    this.getOrMake(name).set(getter);
  }

  removeGauge(name: MetricName<Gauge>): void {
    const metric = this.metrics.get(name.canonical);
    if (metric === undefined) throw new Error("No such gauge: " + name.canonical);
    if (metric.type != MetricType.Gauge) {
      throw new Error(`${name.canonical} is a ${MetricType[metric.type]}, not a gauge`);
    }
    this.metrics.delete(name.canonical);
  }

  distribution(
    name: string,
    tags: Tags = {},
    percentiles = this.percentiles,
    error = this.error
  ): MetricName<Distribution> {
    const maker = (x: MetricName<Distribution>) => new Distribution(x, percentiles, error);
    const metricName = MetricName.create(MetricType.Distribution, name, tags, this.baseMetric, maker);
    this.getOrMake(metricName);
    return metricName;
  }

  addDistribution(name: MetricName<Distribution>, data: number | number[]): void {
    const distribution = this.getOrMake(name);
    distribution.add(data);
    distribution.touch(this.currentTime);
  }

  time<T>(name: MetricName<Distribution>, f: () => T): T {
    const startTime = Date.now();
    const rv = f();
    this.addDistribution(name, Date.now() - startTime);
    return rv;
  }

  timePromise<T>(name: MetricName<Distribution>, f: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    return f().then(rv => {
      this.addDistribution(name, Date.now() - startTime);
      return rv;
    });
  }

  withPrefix(prefix: string): Metrics {
    const _prefix = prefix + this.separator;
    const self = this;
    return {
      counter(name: string, tags?: Tags) { return self.counter(_prefix + name, tags); },
      gauge(name: string, tags?: Tags) { return self.gauge(_prefix + name, tags); },
      distribution(name: string, tags?: Tags, percentiles?: number[], error?: number) {
        return self.distribution(_prefix + name, tags, percentiles, error);
      },
      increment(name: MetricName<Counter>, count?: number) { self.increment(name, count); },
      getCounter(name: MetricName<Counter>) { return self.getCounter(name); },
      setGauge(name: MetricName<Gauge>, getter: number | (() => number)) { self.setGauge(name, getter); },
      removeGauge(name: MetricName<Gauge>) { self.removeGauge(name); },
      addDistribution(name: MetricName<Distribution>, data: number | number[]) { self.addDistribution(name, data); },
      time<T>(name: MetricName<Distribution>, f: () => T) { return self.time(name, f); },
      timePromise<T>(name: MetricName<Distribution>, f: () => Promise<T>) { return self.timePromise(name, f); },
      withPrefix(prefix: string) { return self.withPrefix(_prefix + prefix); }
    };
  }

  private getOrMake<T extends Metric>(name: MetricName<T>): T {
    const metric = this.metrics.get(name.canonical);
    if (metric !== undefined) {
      if (metric.type != name.type) throw new Error(`${name.canonical} is already a ${MetricType[metric.type]}`);
      return metric as T;
    }

    if (name.maker == null) throw new Error("No maker assigned for metric");
    const newMetric = name.maker(name);
    this.metrics.set(name.canonical, newMetric);
    return newMetric;
  }
}
