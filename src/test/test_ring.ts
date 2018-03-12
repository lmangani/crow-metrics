import { deltaSnapshots, MetricsRegistry, RingBuffer } from "..";

import "should";
import "source-map-support/register";


describe("RingBufferObserver", () => {
  let r: MetricsRegistry;

  beforeEach(() => {
    r = new MetricsRegistry();
  });

  afterEach(() => {
    r.stop();
  });

  it("tracks gauges", () => {
    const m = r.metrics;
    const rb = new RingBuffer();
    r.events.map(deltaSnapshots()).forEach(rb.listener);
    m.setGauge(m.gauge("speed"), 45);
    r.publish();
    m.setGauge(m.gauge("speed"), 55);
    r.publish();
    m.setGauge(m.gauge("speed"), 35);
    r.publish();
    rb.get().map(s => s.flatten().get("speed")).should.eql([ 45, 55, 35 ]);
    (rb.getLatest().flatten().get("speed") || 0).should.eql(35);
  });

  it("tracks counters", () => {
    const m = r.metrics;
    const rb = new RingBuffer();
    r.events.map(deltaSnapshots()).forEach(rb.listener);
    m.increment(m.counter("bruises"));
    r.publish();
    m.increment(m.counter("bruises"));
    m.increment(m.counter("bruises"));
    r.publish();
    m.increment(m.counter("bruises"));
    r.publish();
    r.publish();
    m.increment(m.counter("bruises"));
    m.increment(m.counter("bruises"));
    r.publish();
    rb.get().map(s => s.flatten().get("bruises")).should.eql([ 1, 2, 1, 0, 2 ]);
    (rb.getLatest().flatten().get("bruises") || 0).should.eql(2);
    m.getCounter(m.counter("bruises")).should.eql(6);
  });

  it("tracks distributions", () => {
    const m = r.metrics;
    const rb = new RingBuffer();
    r.events.map(deltaSnapshots()).forEach(rb.listener);
    const d = m.distribution("timings", {}, [ 0.5, 0.9 ]);
    m.addDistribution(d, 2);
    m.addDistribution(d, 5);
    m.addDistribution(d, 10);
    r.publish();
    m.addDistribution(d, 3);
    m.addDistribution(d, 4);
    m.addDistribution(d, 6);
    r.publish();

    const flattened = rb.get().map(s => s.flatten());
    flattened.map(s => s.get("timings{p=count}")).should.eql([ 3, 3 ]);
    flattened.map(s => s.get("timings{p=0.5}")).should.eql([ 5, 4 ]);
    flattened.map(s => s.get("timings{p=0.9}")).should.eql([ 10, 6 ]);
    (rb.getLatest().flatten().get("timings{p=count}") || 0).should.eql(3);
    (rb.getLatest().flatten().get("timings{p=0.5}") || 0).should.eql(4);
  });

  it("reports missing metrics", () => {
    const m = r.metrics;
    const rb = new RingBuffer();
    r.events.map(deltaSnapshots()).forEach(rb.listener);
    m.increment(m.counter("cats"), 3);
    r.publish();
    m.increment(m.counter("cats"), 2);
    r.publish();
    m.increment(m.counter("cats"), 4);
    m.increment(m.counter("dogs"), 1);
    r.publish();
    m.increment(m.counter("dogs"), 7);
    r.publish();

    const flattened = rb.get().map(s => s.flatten());
    flattened.map(s => s.get("cats")).should.eql([ 3, 2, 4, 0 ]);
    flattened.map(s => s.get("dogs")).should.eql([ undefined, undefined, 1, 7 ]);
    m.getCounter(m.counter("cats")).should.eql(9);
    m.getCounter(m.counter("dogs")).should.eql(8);
  });

//   it("rotates correctly", () => {
//     const r = new MetricsRegistry();
//     const rb = new RingBufferObserver({ span: r.period * 5 });
//     r.events.map(deltaSnapshots()).subscribe(rb.observer);
//     r.increment(r.counter("bugs"), 1);
//     r.publish();
//     r.increment(r.counter("bugs"), 2);
//     r.publish();
//     r.increment(r.counter("bugs"), 3);
//     r.publish();
//
//     const flattened1 = rb.get().map(s => s.flatten());
//     flattened1.map(s => s.get("bugs")).should.eql([ 1, 2, 3 ]);
//
//     r.increment(r.counter("bugs"), 4);
//     r.publish();
//     r.increment(r.counter("bugs"), 5);
//     r.publish();
//
//     const flattened2 = rb.get().map(s => s.flatten());
//     flattened2.map(s => s.get("bugs")).should.eql([ 1, 2, 3, 4, 5 ]);
//
//     r.increment(r.counter("bugs"), 6);
//     r.publish();
//     r.increment(r.counter("bugs"), 7);
//     r.publish();
//
//     const flattened3 = rb.get().map(s => s.flatten());
//     flattened3.map(s => s.get("bugs")).should.eql([ 3, 4, 5, 6, 7 ]);
//   });
});
