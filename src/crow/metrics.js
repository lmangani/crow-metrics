"use strict";

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

function metricName(i) {
  return Object.keys(MetricType).filter((name) => MetricType[name] == i)[0];
}

class Gauge {
  constructor(name, getter) {
    this.name = name;
    this.type = MetricType.GAUGE;
    this.set(getter);
  }

  set(getter) {
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
    return this.registry.counter(this.name, mergeTags(this.tags, tags));
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
    return this.registry.distribution(this.name, mergeTags(this.tags, tags), this.percentiles, this.error);
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
    let snapshot = this.distribution.snapshot();
    this.distribution.reset();
    let rv = {};
    if (snapshot.sampleCount == 0) return rv;
    this.percentiles.forEach((p) => {
      rv[this.registry._fullname(this.name, this.tags, { quantile: p })] = snapshot.getPercentile(p);
    });
    rv[this.registry._fullname(this.name + "_count", this.tags)] = snapshot.sampleCount;
    rv[this.registry._fullname(this.name + "_sum", this.tags)] = snapshot.sampleSum;
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

function mergeTags(tags, newtags) {
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


exports.Counter = Counter;
exports.Distribution = Distribution;
exports.Gauge = Gauge;
exports.metricName = metricName;
exports.MetricType = MetricType;
