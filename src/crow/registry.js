"use strict";

import Counter from "./metrics/counter";
import Gauge from "./metrics/gauge";
import makeTags from "./metrics/tags";
import Snapshot from "./snapshot";

const DEFAULT_PERCENTILES = [ 0.5, 0.9, 0.99 ];
const DEFAULT_ERROR = 0.01;


/*
 * The registry is the central coordinator for metrics collection and
 * dispersal. It tracks metrics in a single namespace, and periodically
 * takes a snapshot and sends it to any observers. (A typical observer might
 * push the metrics into riemann, influxdb, or prometheus.)
 *
 * Each metric object contains:
 *   - name
 *   - tags
 *   - value: Number or Map(String -> Number)
 *
 * options:
 *   - period: (msec) how often to send snapshots to observers
 *   - percentiles: (array) default percentiles to track on distributions
 *   - error: (number) default error to allow on distribution ranks
 *   - log: bunyan logger for debugging
 *   - tags: (object) default tags to apply to each metric
 *   - separator: (string) what to use in `withPrefix`; default is "_"
 */
export default class Registry {
  constructor(options = {}) {
    // metrics are stored by their "fully-qualified" name, using stringified tags.
    this.metrics = new Map();
    this.observers = [];
    this.period = options.period || 60000;
    this.percentiles = options.percentiles || DEFAULT_PERCENTILES;
    this.error = options.error || DEFAULT_ERROR;
    this.log = options.log;
    this.lastPublish = Date.now();
    this.tags = makeTags(options.tags);
    this.separator = options.separator || "_";

    // if the period is a multiple of minute, 30 sec, 5 sec, or 1 sec, then
    // round the next publish time to that.
    this.periodRounding = 1;
    [ 60000, 30000, 15000, 10000, 5000, 1000 ].forEach((r) => {
      if (this.periodRounding == 1 && this.period % r == 0) {
        this.periodRounding = r;
      }
    });

    this._schedulePublish();

    this.version = "?";
    try {
      this.version = require("../../package.json").version;
    } catch (error) {
      // don't worry about it.
    }
    if (this.log) this.log.info(`crow-metrics ${this.version} started; period_sec=${this.period / 1000}`);
  }

  _schedulePublish() {
    const nextTime = Math.round((this.lastPublish + this.period) / this.periodRounding) * this.periodRounding;
    let duration = nextTime - Date.now();
    while (duration < 0) duration += this.period;
    setTimeout(() => this._publish(), duration);
  }

//   _publish() {
//     this.lastPublish = Date.now();
//     let snapshot = this._snapshot();
//     if (this.log) this.log.trace(`Publishing ${Object.keys(this.metrics).length} metrics to ${this.observers.length} observers.`);
//
//     this.observers.forEach((observer) => {
//       try {
//         observer(this.lastPublish, snapshot);
//       } catch (error) {
//         if (this.log) this.log.error({ error: error }, "Error in crow observer (skipping)");
//       }
//     });
//
//     this._schedulePublish();
//   }
//
//   /*
//    * Add an observer, which should be a function:
//    *
//    *     function observer(timestamp, snapshot)
//    *
//    * The timestamp is in milliseconds, and the snapshot is an object with
//    * fully-qualified metric names as the keys, and numbers as the values.
//    * For example: `{ "requests_served": 10 }`
//    */
//   addObserver(observer) {
//     this.observers.push(observer);
//   }

  /*
   * Return a snapshot of the current value of each metric.
   * Distributions will be reset.
   */
  snapshot() {
    const timestamp = Date.now();
    const map = new Map();
    for (const metric of this.metrics.values()) {
      map.set(metric, metric.value);
    }
    return new Snapshot(timestamp, map);
  }

  /*
   * Fetch the counter with a given name (and optional tags).
   * If no counter by that name/tag combination exists, it's created.
   */
  counter(name, tags = null) {
    return this._getOrMake(name, tags, Counter, (name, tags) => new Counter(this, name, tags));
  }

  /*
   * Fetch the gauge with a given name (and optional tags).
   * If no gauge by that name/tag combination exists, an exception is thrown.
   */
  gauge(name, tags = null) {
    return this._getOrMake(name, tags, Gauge, () => {
      throw new Error("No such metric");
    });
  }

  /*
   * Add (or replace) a gauge with the given name (and optional tags).
   * The getter is normally a function that computes the value on demand,
   * but if the value changes rarely or never, you may use a constant value
   * instead.
   */
  setGauge(name, tags = null, getter) {
    if (getter === undefined) {
      // addGauge(name, getter)
      getter = tags;
      tags = null;
    }
    return this._getOrMake(name, tags, Gauge, (name, tags) => new Gauge(name, tags, getter)).set(getter);
  }

//   /*
//    * Fetch the distribution with a given name (and optional tags).
//    * If no distribution by that name/tag combination exists, it's generated.
//    */
//   distribution(name, tags = {}, percentiles = this.percentiles, error = this.error) {
//     return this._getOrMake(name, mergeDefaults(tags, this.tags), MetricType.DISTRIBUTION, (name, fullname, tags) => {
//       return new metrics.Distribution(this, name, fullname, tags, percentiles, error);
//     });
//   }
//
//   /*
//    * Return a new registry-like object that has accessors for metrics, but
//    * prefixes all names with `(prefix)_`.
//    */
//   withPrefix(prefix) {
//     return {
//       counter: (name, tags) => this.counter(`${prefix}${this.separator}${name}`, tags),
//       gauge: (name, tags) => this.gauge(`${prefix}${this.separator}${name}`, tags),
//       setGauge: (name, tags, getter) => this.setGauge(`${prefix}${this.separator}${name}`, tags, getter),
//       distribution: (name, tags, percentiles, error) => this.distribution(`${prefix}${this.separator}${name}`, tags, percentiles, error),
//       withPrefix: (nextPrefix) => this.withPrefix(`${prefix}${this.separator}${nextPrefix}`),
//       addObserver: (x) => this.addObserver(x)
//     };
//   }

  // maker: (name, tags) => metric object
  _getOrMake(name, tags, type, maker) {
    tags = this.tags.merge(makeTags(tags));
    const fullname = name + tags.canonical;
    let metric = this.metrics.get(fullname);
    if (metric !== undefined) {
      if (metric.constructor != type) {
        throw new Error(`${fullname} is already a ${type.name.toLowerCase()}`);
      }
      return metric;
    }
    metric = maker(name, tags);
    this.metrics.set(fullname, metric);
    return metric;
  }
}

// function mergeDefaults(tags, defaults) {
//   for (let key in defaults) {
//     if (tags[key] === undefined) tags[key] = defaults[key];
//   }
//   return tags;
// }
