"use strict";

import { MetricsRegistry, DeltaObserver, Snapshot } from "../src";

import "should";
import "source-map-support/register";


function delay(msec: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, msec));
}

describe("DeltaObserver", () => {
  it("passes through gauges and distributions unharmed", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry();
    const d = new DeltaObserver();
    d.addObserver(s => snapshots.push(s));
    r.addObserver(d.observer);

    r.setGauge(r.gauge("speed"), 45);
    r.addDistribution(r.distribution("timings", { instance: "i-9999" }, [ 0.9 ]), 10);
    r.publish();
    snapshots.length.should.eql(1);
    Array.from(snapshots[0].flatten()).sort().should.eql([
      [ "speed", 45 ],
      [ "timings{instance=i-9999,p=0.9}", 10 ],
      [ "timings{instance=i-9999,p=count}", 1 ],
      [ "timings{instance=i-9999,p=sum}", 10 ]
    ]);
  });

  it("computes deltas for counters", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry();
    const d = new DeltaObserver();
    d.addObserver(s => snapshots.push(s));
    r.addObserver(d.observer);

    r.increment(r.counter("tickets"), 5);
    r.publish();
    r.increment(r.counter("tickets"), 1);
    r.publish();
    r.publish();

    snapshots.length.should.eql(3);
    (snapshots[0].flatten().get("tickets") as any).should.eql(5);
    (snapshots[1].flatten().get("tickets") as any).should.eql(1);
    (snapshots[2].flatten().get("tickets") as any).should.eql(0);
  });

  it("remembers old values across slow times", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry();
    const d = new DeltaObserver();
    d.addObserver(s => snapshots.push(s));
    r.addObserver(d.observer);

    r.publish();
    r.increment(r.counter("cats"), 1);
    r.publish();
    r.increment(r.counter("cats"), 3);
    r.publish();
    r.increment(r.counter("cats"), 2);
    r.increment(r.counter("dogs"), 5);
    r.publish();
    r.publish();
    r.increment(r.counter("dogs"), 1);
    r.publish();

    snapshots.length.should.eql(6);
    snapshots.map(s => (s.flatten().get("cats"))).should.eql([ undefined, 1, 3, 2, 0, 0 ]);
    snapshots.map(s => (s.flatten().get("dogs"))).should.eql([ undefined, undefined, undefined, 5, 0, 1 ]);
  });

  it("forgets old values after expiration", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry({ expire: 100 });
    const d = new DeltaObserver();
    d.addObserver(s => snapshots.push(s));
    r.addObserver(d.observer);

    r.increment(r.counter("cats"), 5);
    r.setGauge(r.gauge("speed"), () => 100);
    r.addDistribution(r.distribution("bugs"), 23);
    r.publish();
    return delay(50).then(() => {
      r.increment(r.counter("cats"), 6);
      r.publish();
      return delay(150);
    }).then(() => {
      r.publish();
      return delay(50);
    }).then(() => {
      r.increment(r.counter("cats"), 2);
      r.publish();

      snapshots.length.should.eql(4);
      snapshots.map(s => (s.flatten().get("cats"))).should.eql([ 5, 6, undefined, 2 ]);
    });
  });
  //
  // it("will turn a counter into a distribution, by tag", () => {
  //   const snapshots = [];
  //   const r = new MetricsRegistry();
  //   const d = new DeltaObserver({
  //     rank: [
  //       { name: "traffic_per_session", match: "bytes", tags: [ "session" ] }
  //     ]
  //   });
  //   d.addObserver(s => snapshots.push(s));
  //   r.addObserver(d.observer);
  //
  //   r.counter("bytes", { session: "3" }).increment(10);
  //   r.counter("bytes", { session: "4" }).increment(20);
  //   r.counter("bytes", { session: "5" }).increment(30);
  //   r._publish();
  //   Array.from(snapshots[0].flatten()).sort().should.eql([
  //     [ "traffic_per_session{p=0.5}", { type: "distribution", value: 20 } ],
  //     [ "traffic_per_session{p=0.99}", { type: "distribution", value: 30 } ],
  //     [ "traffic_per_session{p=0.9}", { type: "distribution", value: 30 } ],
  //     [ "traffic_per_session{p=count}", { type: "distribution", value: 3 } ],
  //     [ "traffic_per_session{p=sum}", { type: "distribution", value: 60 } ]
  //   ]);
  // });
  //
  // it("will preserve other tags when constructing distributions", () => {
  //   const snapshots = [];
  //   const r = new MetricsRegistry();
  //   const d = new DeltaObserver({
  //     rank: [
  //       { name: "traffic_per_session", match: "bytes", tags: [ "session" ] }
  //     ]
  //   });
  //   d.addObserver(s => snapshots.push(s));
  //   r.addObserver(d.observer);
  //
  //   r.counter("bytes", { type: "cat", session: "3" }).increment(10);
  //   r.counter("bytes", { type: "mouse", session: "4" }).increment(20);
  //   r.counter("bytes", { type: "mouse", session: "5" }).increment(29);
  //   r.counter("bytes", { type: "mouse", session: "5" }).increment(1);
  //   r._publish();
  //   Array.from(snapshots[0].flatten()).sort().should.eql([
  //     [ "traffic_per_session{p=0.5,type=cat}", { type: "distribution", value: 10 } ],
  //     [ "traffic_per_session{p=0.5,type=mouse}", { type: "distribution", value: 30 } ],
  //     [ "traffic_per_session{p=0.9,type=cat}", { type: "distribution", value: 10 } ],
  //     [ "traffic_per_session{p=0.9,type=mouse}", { type: "distribution", value: 30 } ],
  //     [ "traffic_per_session{p=0.99,type=cat}", { type: "distribution", value: 10 } ],
  //     [ "traffic_per_session{p=0.99,type=mouse}", { type: "distribution", value: 30 } ],
  //     [ "traffic_per_session{p=count,type=cat}", { type: "distribution", value: 1 } ],
  //     [ "traffic_per_session{p=count,type=mouse}", { type: "distribution", value: 2 } ],
  //     [ "traffic_per_session{p=sum,type=cat}", { type: "distribution", value: 10 } ],
  //     [ "traffic_per_session{p=sum,type=mouse}", { type: "distribution", value: 50 } ]
  //   ]);
  // });
});
