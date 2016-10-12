"use strict";

import { tagDistribution, MetricsRegistry, Snapshot } from "../src";

import "should";
import "source-map-support/register";


function delay(msec: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, msec));
}

describe("tagDistribution", () => {
  it("will turn a counter into a distribution, by tag", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry();
    const matcher = { name: "traffic_per_session", match: "bytes", sortByTags: [ "session" ] };
    r.events.map(tagDistribution(r, matcher)).subscribe(s => snapshots.push(s));

    r.increment(r.counter("bytes", { session: "3" }), 10);
    r.increment(r.counter("bytes", { session: "4" }), 20);
    r.increment(r.counter("bytes", { session: "5" }), 30);
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
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry();
    const matcher = { name: "traffic_per_session", match: "bytes", sortByTags: [ "session" ] };
    r.events.map(tagDistribution(r, matcher)).subscribe(s => snapshots.push(s));

    r.increment(r.counter("bytes", { type: "cat", session: "3" }), 10);
    r.increment(r.counter("bytes", { type: "mouse", session: "4" }), 20);
    r.increment(r.counter("bytes", { type: "mouse", session: "5" }), 29);
    r.increment(r.counter("bytes", { type: "mouse", session: "5" }), 1);
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
