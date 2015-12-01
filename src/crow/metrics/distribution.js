"use strict";

import BiasedQuantileDistribution from "../bqdist";

/*
 * A distribution collects samples over a time period, and then summarizes
 * them based on percentiles requested (median, 90th percentile, and so on).
 */
export default class Distribution {
  constructor(registry, name, tags, percentiles, error) {
    this.registry = registry;
    this.name = name;
    this.tags = tags;
    this.percentiles = percentiles;
    this.error = error;
    this.distribution = new BiasedQuantileDistribution(this.percentiles, this.error);
    this.lastUpdated = 0;
    this.reaped = false;
  }

  /*
   * return a distribution with the same name, but different tags.
   * you may "remove" tags by setting them to null.
   * this call defers to the registry, so if a distribution with this tag
   * combination already exists, that will be returned. otherwise, a new
   * distribution is created.
   */
  withTags(tags) {
    return this.registry.distribution(this.name, this.tags.merge(tags), this.percentiles, this.error);
  }

  /*
   * add one data point (or more, if an array) to the distribution.
   */
  add(data) {
    if (this.reaped) {
      if (!this.forwarded || this.forwarded.reaped) {
        this.forwarded = this.registry.distribution(this.name, this.tags, this.percentiles, this.error);
      }
      return this.forwarded.add(data);
    }

    this.lastUpdated = Date.now();
    if (Array.isArray(data)) {
      data.forEach(x => this.distribution.record(x));
    } else {
      this.distribution.record(data);
    }
  }

  get value() {
    if (this.forwarded) return this.forwarded.value;
    const snapshot = this.distribution.snapshot();
    this.distribution.reset();
    const rv = new Map();
    if (snapshot.sampleCount == 0) return rv;
    this.percentiles.forEach(p => {
      rv.set(p.toString(), snapshot.getPercentile(p));
    });
    rv.set("count", snapshot.sampleCount);
    rv.set("sum", snapshot.sampleSum);
    return rv;
  }

  /*
   * time a function call and record it (in milliseconds).
   * if the function returns a promise, the recorded time will cover the time
   * until the promise succeeds.
   * exceptions (and rejected promises) are not recorded.
   */
  time(f) {
    const startTime = Date.now();
    const rv = f();
    // you aren't going to believe this. the type of null is... "object". :(
    if (rv != null && typeof rv === "object" && typeof rv.then === "function") {
      return rv.then(rv2 => {
        this.add(Date.now() - startTime);
        return rv2;
      });
    } else {
      this.add(Date.now() - startTime);
      return rv;
    }
  }
}
