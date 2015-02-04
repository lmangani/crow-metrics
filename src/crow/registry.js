let bqdist = require("./bqdist");
let util = require("util");

/*
 * every metric has a name and tags.
 */

let MetricType = {
  GAUGE: 0,
  COUNTER: 1,
  DISTRIBUTION: 2
};

function _metricName(i) {
  return Object.keys(MetricType).filter((name) => MetricType[name] == i)[0];
}

let DEFAULT_PERCENTILES = [ 0.5, 0.9, 0.99 ];
let DEFAULT_ERROR = 0.01;

class Gauge {
  constructor(name, getter) {
    this.name = name;
    this.type = MetricType.GAUGE;
    this.get = (typeof getter === "function") ? getter : (() => getter);
  }
}

class Counter {
  constructor(registry, name, tags = {}) {
    this.registry = registry;
    this.name = name;
    this.tags = tags;
    this.type = MetricType.COUNTER;
    this.value = 0;
  }

  /*
   * return a counter with the same name, but different tags.
   * you may "remove" tags by setting them to null.
   * this call defers to the registry, so if a counter with this tag
   * combination already exists, that will be returned. otherwise, a new
   * counter is created.
   */
  withTags(tags) {
    return this.registry.counter(this.name, this.registry._mergeTags(this.tags, tags));
  }

  increment(count = 1, tags = {}) {
    if (typeof count === "object") {
      // increment(tags)
      tags = count;
      count = 1;
    }
    if (Object.keys(tags).length > 0) {
      this.withTags(tags).increment(count);
    } else {
      this.value += count;
    }
  }

  get() {
    return this.value;
  }
}

class Distribution {
  constructor(registry, name, tags = {}, percentiles, error) {
    this.registry = registry;
    this.name = name;
    this.tags = tags;
    this.percentiles = percentiles;
    this.error = error;
    this.type = MetricType.DISTRIBUTION;
    this.distribution = new bqdist.BiasedQuantileDistribution(this.percentiles, this.error);
  }

  /*
   * return a distribution with the same name, but different tags.
   * you may "remove" tags by setting them to null.
   * this call defers to the registry, so if a distribution with this tag
   * combination already exists, that will be returned. otherwise, a new
   * distribution is created.
   */
  withTags(tags) {
    return this.registry.distribution(this.name, this.registry._mergeTags(this.tags, tags), this.percentiles, this.error);
  }

  /*
   * add one data point (or more, if an array) to the distribution.
   */
  add(data) {
    if (Array.isArray(data)) {
      data.forEach((x) => this.distribution.record(x));
    } else {
      this.distribution.record(data);
    }
  }

  get() {
    let snapshot = this.distribution.reset();
    let rv = {};
    if (snapshot.sampleCount == 0) return rv;
    this.percentiles.forEach((p) => {
      rv[this.registry._fullname(this.name, this.tags, { quantile: p })] = snapshot.getPercentile(p);
    });
    rv[this.registry._fullname(this.name + "_count", this.tags)] = snapshot.sampleCount;
    return rv;
  }

  /*
   * time a function call and record it (in milliseconds).
   * if the function returns a promise, the recorded time will cover the time
   * until the promise succeeds.
   * exceptions (and rejected promises) are not recorded.
   */
  time(f) {
    let startTime = Date.now();
    let rv = f();
    // you aren't going to believe this. the type of null is... "object". :(
    if (rv != null && typeof rv === "object" && typeof rv.then === "function") {
      return rv.then((rv2) => {
        this.add(Date.now() - startTime);
        return rv2;
      })
    } else {
      this.add(Date.now() - startTime);
      return rv;
    }
  }
}


/*
 * The registry is the central coordinator for metrics collection and
 * dispersal. It tracks metrics in a single namespace, and periodically
 * takes a snapshot and sends it to any observers. (A typical observer might
 * push the metrics into riemann, influxdb, or prometheus.)
 *
 * options:
 * - period: (msec) how often to send snapshots to observers
 * - percentiles: (array) default percentiles to track on distributions
 * - error: (number) default error to allow on distribution ranks
 * - log: bunyan logger for debugging
 */
class Registry {
  /*
   * each metric is stored by its fully-qualified name in `metrics`. for
   * example, a counter named "buckets" with a tag of cats="yes" is stored
   * by `buckets{cats="yes"}`.
   */
  constructor(options = {}) {
    // i want to use Map here, but Map's polyfill is busted.
    this.metrics = {};
    this.observers = [];
    this.period = options.period || 60000;
    this.percentiles = options.percentiles || DEFAULT_PERCENTILES;
    this.error = options.error || DEFAULT_ERROR;
    this.log = options.log;
    this.lastPublish = Date.now();

    // if the period is a multiple of minute, 30 sec, 5 sec, or 1 sec, then
    // round the next publish time to that.
    this.periodRounding = 1;
    [ 60000, 30000, 15000, 10000, 5000, 1000 ].forEach((r) => {
      if (this.periodRounding == 1 && this.period % r == 0) {
        this.periodRounding = r;
      }
    });

    this._schedulePublish();
  }

  _schedulePublish() {
    let nextTime = Math.round((this.lastPublish + this.period) / this.periodRounding) * this.periodRounding;
    let duration = nextTime - Date.now();
    while (duration < 0) duration += this.period;
    setTimeout(() => this._publish(), duration);
  }

  _publish() {
    this.lastPublish = Date.now();
    let snapshot = this.snapshot();
    if (this.log) this.log.trace(`Publishing ${Object.keys(this.metrics).length} metrics to ${this.observers.length} observers.`);

    this.observers.forEach((observer) => {
      try {
        observer(this.lastPublish, snapshot);
      } catch (error) {
        if (this.log) this.log.error({ error: error }, "Error in crow observer (skipping)");
      }
    });

    this._schedulePublish();
  }

  /*
   * add an observer, which should be a function:
   *
   *     function observer(timestamp, snapshot)
   *
   * the timestamp is in milliseconds, and the snapshot is an object with
   * fully-qualified metric names as the keys, and numbers as the values.
   * for example: `{ "requests_served": 10 }`
   */
  addObserver(observer) {
    this.observers.push(observer);
  }

  /*
   * grab a snapshot of the current value of each metric.
   */
  snapshot() {
    let rv = {};
    for (let key in this.metrics) {
      let metric = this.metrics[key];
      switch (metric.type) {
        case MetricType.DISTRIBUTION:
          let stats = this.metrics[key].get();
          for (let key in stats) rv[key] = stats[key];
          break;
        default:
          rv[key] = this.metrics[key].get();
      }
    }
    return rv;    
  }

  /*
   * fetch the counter with a given name (and optional tags).
   * if no counter by that name/tag combination exists, it's created.
   */
  counter(name, tags = {}) {
    return this._getOrMake(name, tags, MetricType.COUNTER, () => new Counter(this, name, tags));
  }

  /*
   * fetch the gauge with a given name (and optional tags).
   * if no gauge by that name/tag combination exists, an exception is thrown.
   */
  gauge(name, tags = {}) {
    return this._getOrMake(name, tags, MetricType.GAUGE, () => {
      throw new Error("No such metric");
    });
  }

  /*
   * add (or replace) a gauge with the given name (and optional tags).
   * the getter is normally a function that computes the value on demand,
   * but if the value changes rarely or never, you may use a constant value
   * instead.
   */
  setGauge(name, tags = {}, getter) {
    if (getter === undefined) {
      // addGauge(name, getter)
      getter = tags;
      tags = {};
    }
    return this._getOrMake(name, tags, MetricType.GAUGE, () => new Gauge(name, getter));
  }

  /*
   * fetch the distribution with a given name (and optional tags).
   * if no distribution by that name/tag combination exists, it's generated.
   */
  distribution(name, tags = {}, percentiles = this.percentiles, error = this.error) {
    return this._getOrMake(name, tags, MetricType.DISTRIBUTION, () => new Distribution(this, name, tags, percentiles, error));
  }
  
  _getOrMake(name, tags, type, maker) {
    let fullname = this._fullname(name, tags);
    let metric = this.metrics[fullname];
    if (metric !== undefined) {
      if (metric.type != type) throw new Error(`${fullname} is already a ${_metricName(metric.type).toLowerCase()}`);
      return metric;
    }
    metric = maker();
    this.metrics[fullname] = metric;
    return metric;
  }

  _fullname(name, tags, extraTags = {}) {
    let keys = Object.keys(tags).sort();
    let extraKeys = Object.keys(extraTags).sort();
    if (keys.length == 0 && extraKeys.length == 0) return name;
    let fields = keys.map((key) => `${key}="${tags[key]}"`);
    if (extraKeys.length > 0) fields = fields.concat(extraKeys.map((key) => `${key}="${extraTags[key]}"`));
    return name + "{" + fields.join(",") + "}";
  }

  _mergeTags(tags, newtags) {
    let rv = {};
    for (let key in tags) rv[key] = tags[key];
    for (let key in newtags) {
      if (newtags[key] === null) {
        delete rv[key];
      } else {
        rv[key] = newtags[key];
      }
    }
    return rv;
  }
}


exports.Registry = Registry;
