"use strict";

import { tagDistribution, MetricsRegistry, Snapshot } from "..";

import "should";
import "source-map-support/register";


function delay(msec: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, msec));
}

describe("tagDistribution", () => {
  let r: MetricsRegistry;

  beforeEach(() => {
    r = new MetricsRegistry();
  });

  afterEach(() => {
    r.stop();
  });

  it("will turn a counter into a distribution, by tag", () => {
    const m = r.metrics;
    const snapshots: Snapshot[] = [];
    const matcher = { name: "traffic_per_session", match: "bytes", sortByTags: [ "session" ] };
    r.events.map(tagDistribution(m, matcher)).forEach(s => snapshots.push(s));

    m.increment(m.counter("bytes", { session: "3" }), 10);
    m.increment(m.counter("bytes", { session: "4" }), 20);
    m.increment(m.counter("bytes", { session: "5" }), 30);
    r.publish();
    Array.from(snapshots[0].flatten()).sort().should.eql([
      [ "traffic_per_session{p=0.5}", 20 ],
      [ "traffic_per_session{p=0.99}", 30 ],
      [ "traffic_per_session{p=0.9}", 30 ],
      [ "traffic_per_session{p=count}", 3 ],
      [ "traffic_per_session{p=sum}", 60 ]
    ]);
  });

  it("will preserve other tags when constructing distributions", () => {
    const m = r.metrics;
    const snapshots: Snapshot[] = [];
    const matcher = { name: "traffic_per_session", match: "bytes", sortByTags: [ "session" ] };
    r.events.map(tagDistribution(m, matcher)).forEach(s => snapshots.push(s));

    m.increment(m.counter("bytes", { type: "cat", session: "3" }), 10);
    m.increment(m.counter("bytes", { type: "mouse", session: "4" }), 20);
    m.increment(m.counter("bytes", { type: "mouse", session: "5" }), 29);
    m.increment(m.counter("bytes", { type: "mouse", session: "5" }), 1);
    r.publish();
    Array.from(snapshots[0].flatten()).sort().should.eql([
      [ "traffic_per_session{p=0.5,type=cat}", 10 ],
      [ "traffic_per_session{p=0.5,type=mouse}", 30 ],
      [ "traffic_per_session{p=0.9,type=cat}", 10 ],
      [ "traffic_per_session{p=0.9,type=mouse}", 30 ],
      [ "traffic_per_session{p=0.99,type=cat}", 10 ],
      [ "traffic_per_session{p=0.99,type=mouse}", 30 ],
      [ "traffic_per_session{p=count,type=cat}", 1 ],
      [ "traffic_per_session{p=count,type=mouse}", 2 ],
      [ "traffic_per_session{p=sum,type=cat}", 10 ],
      [ "traffic_per_session{p=sum,type=mouse}", 50 ]
    ]);
  });
});
