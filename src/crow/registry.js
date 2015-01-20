let util = require("util");

/*
 * The registry is the central coordinator for metrics collection and
 * dispersal. It tracks metrics in a single namespace, and periodically
 * takes a snapshot and sends it to any observers. (A typical observer might
 * push the metrics into graphite or influxdb.)
 *
 * options:
 * - period: (msec) how often to send snapshots to observers
 * - log: bunyan logger for debugging
 */
class Registry {
  constructor(options = {}) {
    this.metrics = new Map();
    this.observers = [];
    this.period = options.period || 60000;
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

    this.schedulePublish();
  }

  schedulePublish() {
    let nextTime = Math.round((this.lastPublish + this.period) / this.periodRounding) * this.periodRounding;
    let duration = nextTime - Date.now();
    while (duration < 0) duration += this.period;
    setTimeout(() => this.publish(), duration);
  }

  publish() {
    this.lastPublish = Date.now();
    try {
      if (this.log) this.log.trace(`Publishing ${this.metrics.size} metrics to ${this.observers.length} observers.`);

      // FIXME

    } catch (error) {
      if (this.log) this.log.error({ error: error }, "Error in crow publisher");
    } finally {
      this.schedulePublish();
    }
  }
}




var MetricType = {
  GAUGE: 0,
  COUNTER: 1,
  DISTRIBUTION: 2
};

class Gauge {
  constructor(name, getter) {
    this.name = name;
    this.type = MetricType.GAUGE;
    this.getter = getter;
  }
}

class Counter {
  constructor(name) {
    this.name = name;
    this.type = MetricType.COUNTER;
    this.value = 0;
  }

  increment(count = 1) {
    this.value += count;
  }
}



exports.Registry = Registry;
