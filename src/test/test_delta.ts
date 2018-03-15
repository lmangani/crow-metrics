import { deltaSnapshots, Metrics, Snapshot } from "..";

import "should";
import "source-map-support/register";


function delay(msec: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, msec));
}

describe("deltaSnapshots", () => {
  let m: Metrics;

  beforeEach(() => {
    m = Metrics.create();
  });

  afterEach(() => {
    m.registry.stop();
  });

  it("passes through gauges and distributions unharmed", () => {
    const snapshots: Snapshot[] = [];
    m.events.map(deltaSnapshots()).forEach(s => snapshots.push(s));

    m.setGauge(m.gauge("speed"), 45);
    m.addDistribution(m.distribution("timings", { instance: "i-9999" }, [ 0.9 ]), 10);
    m.registry.publish();
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
    m.events.map(deltaSnapshots()).forEach(s => snapshots.push(s));

    m.increment(m.counter("tickets"), 5);
    m.registry.publish();
    m.increment(m.counter("tickets"), 1);
    m.registry.publish();
    m.registry.publish();

    snapshots.length.should.eql(3);
    (snapshots[0].flatten().get("tickets") as any).should.eql(5);
    (snapshots[1].flatten().get("tickets") as any).should.eql(1);
    (snapshots[2].flatten().get("tickets") as any).should.eql(0);
  });

  it("remembers old values across slow times", () => {
    const snapshots: Snapshot[] = [];
    m.events.map(deltaSnapshots()).forEach(s => snapshots.push(s));

    m.registry.publish();
    m.increment(m.counter("cats"), 1);
    m.registry.publish();
    m.increment(m.counter("cats"), 3);
    m.registry.publish();
    m.increment(m.counter("cats"), 2);
    m.increment(m.counter("dogs"), 5);
    m.registry.publish();
    m.registry.publish();
    m.increment(m.counter("dogs"), 1);
    m.registry.publish();

    snapshots.length.should.eql(6);
    snapshots.map(s => (s.flatten().get("cats"))).should.eql([ undefined, 1, 3, 2, 0, 0 ]);
    snapshots.map(s => (s.flatten().get("dogs"))).should.eql([ undefined, undefined, undefined, 5, 0, 1 ]);
  });

  it("forgets old values after expiration", async () => {
    const snapshots: Snapshot[] = [];
    m.registry.stop();
    m = Metrics.create({ expire: 100 });
    m.events.map(deltaSnapshots()).forEach(s => snapshots.push(s));

    m.increment(m.counter("cats"), 5);
    m.setGauge(m.gauge("speed"), () => 100);
    m.addDistribution(m.distribution("bugs"), 23);
    m.registry.publish();
    await delay(50);

    m.increment(m.counter("cats"), 6);
    m.registry.publish();
    await delay(150);

    m.registry.publish();
    await delay(50);

    m.increment(m.counter("cats"), 2);
    m.registry.publish();

    snapshots.length.should.eql(4);
    snapshots.map(s => (s.flatten().get("cats"))).should.eql([ 5, 6, undefined, 2 ]);
  });
});
