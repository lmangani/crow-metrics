"use strict";

import { Registry, deltaObserver } from "../../lib";

import "should";
import "source-map-support/register";


describe("DeltaObserver", () => {
  it("passes through gauges and distributions unharmed", () => {
    const snapshots = [];
    const r = new Registry();
    r.addObserver(deltaObserver(s => snapshots.push(s)));

    r.setGauge("speed", 45);
    r.distribution("timings", { instance: "i-9999" }, [ 0.9 ]).add(10);
    r._publish();
    snapshots.length.should.eql(1);
    Array.from(snapshots[0].flatten()).sort().should.eql([
      [ "speed", { value: 45, type: "gauge" } ],
      [ "timings{instance=i-9999,p=0.9}", { value: 10, type: "distribution" } ],
      [ "timings{instance=i-9999,p=count}", { value: 1, type: "distribution" } ],
      [ "timings{instance=i-9999,p=sum}", { value: 10, type: "distribution" } ]
    ]);
  });

  it("computes deltas for counters", () => {
    const snapshots = [];
    const r = new Registry();
    r.addObserver(deltaObserver(s => snapshots.push(s)));

    r.counter("tickets").increment(5);
    r._publish();
    r.counter("tickets").increment(1);
    r._publish();
    r._publish();

    snapshots.length.should.eql(3);
    snapshots[0].flatten().get("tickets").value.should.eql(5);
    snapshots[1].flatten().get("tickets").value.should.eql(1);
    snapshots[2].flatten().get("tickets").value.should.eql(0);
  });

  it("remembers old values across slow times", () => {
    const snapshots = [];
    const r = new Registry();
    r.addObserver(deltaObserver(s => snapshots.push(s)));

    r._publish();
    r.counter("cats").increment(1);
    r._publish();
    r.counter("cats").increment(3);
    r._publish();
    r.counter("cats").increment(2);
    r.counter("dogs").increment(5);
    r._publish();
    r._publish();
    r.counter("dogs").increment(1);
    r._publish();

    snapshots.length.should.eql(6);
    snapshots.map(s => (s.flatten().get("cats") || {}).value).should.eql([ undefined, 1, 3, 2, 0, 0 ]);
    snapshots.map(s => (s.flatten().get("dogs") || {}).value).should.eql([ undefined, undefined, undefined, 5, 0, 1 ]);
  });
});
