"use strict";

const Promise = require("bluebird");
const registry = require("../../lib/crow/registry");
const ring = require("../../lib/crow/ring");
const util = require("util");

require("should");
require("source-map-support").install();

describe("RingBufferObserver", () => {
  it("tracks gauges", () => {
    const r = new registry.Registry();
    const rb = new ring.RingBufferObserver(r);
    r.setGauge("speed", 45);
    r._publish();
    r.setGauge("speed", 55);
    r._publish();
    r.setGauge("speed", 35);
    r._publish();
    rb.toJson()["speed"].should.eql([ 45, 55, 35 ]);
  });

  it("tracks counters", () => {
    const r = new registry.Registry();
    const rb = new ring.RingBufferObserver(r);
    r.counter("bruises").increment();
    r.counter("bruises").increment();
    r._publish();
    r.counter("bruises").increment();
    r._publish();
    rb.toJson()["bruises"].should.eql([ 2, 1 ]);
  });

  it("tracks distributions", () => {
    const r = new registry.Registry();
    const rb = new ring.RingBufferObserver(r);
    const d = r.distribution("timings", {}, [ 0.5, 0.9 ]);
    d.add(2);
    d.add(5);
    d.add(10);
    r._publish();
    d.add(3);
    d.add(4);
    d.add(6);
    r._publish();
    const json = rb.toJson();
    json["timings_count"].should.eql([ 3, 3 ]);
    json["timings{quantile=\"0.5\"}"].should.eql([ 5, 4 ]);
    json["timings{quantile=\"0.9\"}"].should.eql([ 10, 6 ]);
  });
});
