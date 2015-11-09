"use strict";

import { Registry, RingBufferObserver } from "../../lib";

import "should";
import "source-map-support/register";


describe("RingBufferObserver", () => {
  it("tracks gauges", () => {
    const r = new Registry();
    const rb = new RingBufferObserver(r);
    r.setGauge("speed", 45);
    r._publish();
    r.setGauge("speed", 55);
    r._publish();
    r.setGauge("speed", 35);
    r._publish();
    rb.toJson()["speed"].should.eql([ 45, 55, 35 ]);
    rb.getLatest().flatten().get("speed").value.should.eql(35);
  });

  it("tracks counters", () => {
    const r = new Registry();
    const rb = new RingBufferObserver(r);
    r.counter("bruises").increment();
    r._publish();
    r.counter("bruises").increment();
    r.counter("bruises").increment();
    r._publish();
    r.counter("bruises").increment();
    r._publish();
    r._publish();
    r.counter("bruises").increment();
    r.counter("bruises").increment();
    r._publish();
    rb.toJson()["bruises"].should.eql([ null, 2, 1, 0, 2 ]);
    rb.getLatest().flatten().get("bruises").value.should.eql(6);
  });

  it("tracks distributions", () => {
    const r = new Registry();
    const rb = new RingBufferObserver(r);
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
    json["timings{p=count}"].should.eql([ 3, 3 ]);
    json["timings{p=0.5}"].should.eql([ 5, 4 ]);
    json["timings{p=0.9}"].should.eql([ 10, 6 ]);
    rb.getLatest().flatten().get("timings{p=count}").value.should.eql(3);
    rb.getLatest().flatten().get("timings{p=0.5}").value.should.eql(4);
  });

  it("reports missing metrics", () => {
    const r = new Registry();
    const rb = new RingBufferObserver(r);
    r.counter("cats").increment(3);
    r._publish();
    r.counter("cats").increment(2);
    r._publish();
    r.counter("cats").increment(4);
    r.counter("dogs").increment(1);
    r._publish();
    r.counter("dogs").increment(7);
    r._publish();
    rb.toJson()["cats"].should.eql([ null, 2, 4, 0 ]);
    rb.toJson()["dogs"].should.eql([ null, null, null, 7 ]);
    rb.getLatest().flatten().get("cats").value.should.eql(9);
    rb.getLatest().flatten().get("dogs").value.should.eql(8);
  });
});
