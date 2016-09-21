import { Metric } from "./metrics/metric";
// import DeltaObserver from "./delta";
import { Distribution } from "./metrics/distribution";
import { Counter } from "./metrics/counter";
import { Gauge } from "./metrics/gauge";
import { MetricName, MetricType, Tags } from "./metric_name";
import { Snapshot } from "./snapshot";

const DEFAULT_PERCENTILES = [ 0.5, 0.9, 0.99 ];
const DEFAULT_ERROR = 0.01;

export interface RegistryOptions {
  // default tags to apply to each metric:
  tags?: Tags;

  // what to use in `withPrefix`; default is "_"
  separator?: string;

  // default percentiles to track on distributions
  percentiles?: number[];

  // default error to allow on distribution ranks
  error?: number;
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
 *   - period: (msec) how often to send snapshots to observers
 *   - log: bunyan logger for debugging
 *   - expire: (msec) stop reporting counters and distributions that haven't
 *     been touched in this long
 */
export class MetricsRegistry {
  // metrics are stored by their "fully-qualified" name, using stringified tags.
  metrics: Map<string, Metric> = new Map();

  private percentiles: number[] = DEFAULT_PERCENTILES;
  private error: number = DEFAULT_ERROR;

  private tags: Tags = null;
  private separator = "_";
  private currentTime = Date.now();

  constructor(options: RegistryOptions = {}) {
//     this.observers = [];
//     this.period = options.period || 60000;
    if (options.percentiles) this.percentiles = options.percentiles;
    if (options.error) this.error = options.error;
//     this.log = options.log;
//     this.lastPublish = Date.now();
    this.tags = options.tags;
    if (options.separator) this.separator = options.separator;
//     this.expire = options.expire;
//
//     // if the period is a multiple of minute, 30 sec, 5 sec, or 1 sec, then
//     // round the next publish time to that.
//     this.periodRounding = 1;
//     [ 60000, 30000, 15000, 10000, 5000, 1000 ].forEach((r) => {
//       if (this.periodRounding == 1 && this.period % r == 0) {
//         this.periodRounding = r;
//       }
//     });
//
//     this._schedulePublish();
//
//     this.version = "?";
//     try {
//       this.version = require("../../package.json").version;
//     } catch (error) {
//       // don't worry about it.
//     }
//     if (this.log) this.log.info(`crow-metrics ${this.version} started; period_sec=${this.period / 1000}`);
  }

//   _schedulePublish() {
//     const nextTime = Math.round((this.lastPublish + this.period) / this.periodRounding) * this.periodRounding;
//     let duration = nextTime - Date.now();
//     while (duration < 0) duration += this.period;
//     setTimeout(() => this._publish(nextTime), duration);
//   }
//
//   // timestamp is optional.
//   _publish(timestamp) {
//     if (!timestamp) timestamp = Date.now();
//     if (this.expire) {
//       for (const [ key, metric ] of this.metrics) {
//         if (metric.type == "gauge") continue;
//         if (timestamp - metric.lastUpdated >= this.expire) {
//           metric.reaped = true;
//           this.metrics.delete(key);
//         }
//       }
//     }
//
//     const snapshot = this.snapshot(timestamp);
//     this.lastPublish = snapshot.timestamp;
//     if (this.log) {
//       this.log.trace(`Publishing ${this.metrics.size} metrics to ${this.observers.length} observers.`);
//     }
//
//     this.observers.forEach(observer => {
//       try {
//         observer(snapshot);
//       } catch (error) {
//         if (this.log) this.log.error({ err: error }, "Error in crow observer (skipping)");
//         // there may be no other way for someone to see there was an error:
//         console.log(error.stack);
//       }
//     });
//
//     this._schedulePublish();
//   }
//
//   /*
//    * Add an observer, which should be a function:
//    *
//    *     function observer(snapshot)
//    *
//    * The snapshot is an object with a timestamp and a map of metrics to
//    * values. (See `Snapshot` for details.)
//    */
//   addObserver(observer) {
//     this.observers.push(observer);
//   }
//
//   /*
//    * Add an observer, as with `addObserver`, but wrapped in a `DeltaObserver`
//    * (convenience method).
//    */
//   addDeltaObserver(observer, options = {}) {
//     const d = new DeltaObserver(options);
//     d.addObserver(observer);
//     this.addObserver(d.observer);
//   }

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

  /*
   * Find or create a counter with the given name and optional tags.
   */
  counter(name: string, tags?: Tags): MetricName<Counter> {
    const metricName = MetricName.create(MetricType.Counter, name, tags, (x: MetricName<Counter>) => new Counter(x));
    this.getOrMake(metricName);
    return metricName;
  }

  /*
   * Increment a counter. If the counter doesn't exist yet, it's created.
   */
  increment(name: MetricName<Counter>, count: number = 1): void {
    const counter = this.getOrMake(name);
    counter.increment(count);
    counter.touch(this.currentTime);
  }

  /*
   * Find or create a gauge with the given name and optional tags.
   */
  gauge(name: string, tags?: Tags): MetricName<Gauge> {
    const metricName = MetricName.create(MetricType.Gauge, name, tags, (x: MetricName<Gauge>) => new Gauge(x));
    this.getOrMake(metricName);
    return metricName;
  }

  /*
   * Add (or replace) a gauge with the given name.
   * The getter is normally a function that computes the value on demand,
   * but if the value changes rarely or never, you may use a constant value
   * instead.
   */
  setGauge(name: MetricName<Gauge>, getter: number | (() => number)) {
    this.getOrMake(name).set(getter);
  }

  /*
   * Remove a gauge.
   */
  removeGauge(name: MetricName<Gauge>): void {
    const metric = this.metrics.get(name.canonical);
    if (metric === undefined) throw new Error("No such gauge: " + name.canonical);
    if (metric.type != MetricType.Gauge) {
      throw new Error(`${name.canonical} is a ${MetricType[metric.type]}, not a gauge`);
    }
    this.metrics.delete(name.canonical);
  }

  /*
   * Find or create a distribution with the given name and optional tags.
   */
  distribution(
    name: string,
    tags: Tags = {},
    percentiles = this.percentiles,
    error = this.error
  ): MetricName<Distribution> {
    const maker = (x: MetricName<Distribution>) => new Distribution(x, percentiles, error);
    const metricName = MetricName.create(MetricType.Distribution, name, tags, maker);
    this.getOrMake(metricName);
    return metricName;
  }

  addDistribution(name: MetricName<Distribution>, data: number | number[]): void {
    const distribution = this.getOrMake(name);
    distribution.add(data);
    distribution.touch(this.currentTime);
  }

  /*
   * Time a function call (in milliseconds) and record it as a data point in
   * a distribution. Exceptions are not recorded.
   */
  time<T>(name: MetricName<Distribution>, f: () => T): T {
    const startTime = Date.now();
    const rv = f();
    this.addDistribution(name, Date.now() - startTime);
    return rv;
  }

  /*
   * Time a function call that returns a promise (in milliseconds) and
   * record it as a data point in a distribution. Rejected promises are not
   * recorded.
   */
  timePromise<T>(name: MetricName<Distribution>, f: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    return f().then(rv => {
      this.addDistribution(name, Date.now() - startTime);
      return rv;
    });
  }

//   /*
//    * Return a new registry-like object that has accessors for metrics, but
//    * prefixes all names with `(prefix)_`.
//    */
//   withPrefix(prefix) {
//     return {
//       counter: (name, tags) => this.counter(`${prefix}${this.separator}${name}`, tags),
//       gauge: (name, tags) => this.gauge(`${prefix}${this.separator}${name}`, tags),
//       setGauge: (name, tags, getter) => this.setGauge(`${prefix}${this.separator}${name}`, tags, getter),
//       removeGauge: (name, tags) => this.removeGauge(`${prefix}${this.separator}${name}`, tags),
//       distribution: (name, tags, percentiles, error) => {
//         return this.distribution(`${prefix}${this.separator}${name}`, tags, percentiles, error);
//       },
//       withPrefix: (nextPrefix) => this.withPrefix(`${prefix}${this.separator}${nextPrefix}`),
//       addObserver: (x) => this.addObserver(x),
//       addDeltaObserver: (x, options = {}) => this.addDeltaObserver(x, options)
//     };
//   }

  private getOrMake<T extends Metric>(name: MetricName<T>): T {
    const metric = this.metrics.get(name.canonical);
    if (metric !== undefined) {
      if (metric.type != name.type) throw new Error(`${name.canonical} is already a ${MetricType[metric.type]}`);
      return metric as T;
    }

    const newMetric = name.maker(name);
    this.metrics.set(name.canonical, newMetric);
    return newMetric;
  }
}
