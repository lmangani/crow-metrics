import { deltaSnapshots, Metrics, RingBuffer } from "..";

import "should";
import "source-map-support/register";


describe("RingBufferObserver", () => {
  let m: Metrics;

  beforeEach(() => {
    m = Metrics.create();
  });

  afterEach(() => {
    m.registry.stop();
  });

  it("tracks gauges", () => {
    const rb = new RingBuffer();
    m.events.map(deltaSnapshots()).attach(rb);
    m.setGauge(m.gauge("speed"), 45);
    m.registry.publish();
    m.setGauge(m.gauge("speed"), 55);
    m.registry.publish();
    m.setGauge(m.gauge("speed"), 35);
    m.registry.publish();
    rb.get().map(s => s.flatten().get("speed")).should.eql([ 45, 55, 35 ]);
    (rb.getLatest().flatten().get("speed") || 0).should.eql(35);
  });

  it("tracks counters", () => {
    const rb = new RingBuffer();
    m.events.map(deltaSnapshots()).attach(rb);
    m.increment(m.counter("bruises"));
    m.registry.publish();
    m.increment(m.counter("bruises"));
    m.increment(m.counter("bruises"));
    m.registry.publish();
    m.increment(m.counter("bruises"));
    m.registry.publish();
    m.registry.publish();
    m.increment(m.counter("bruises"));
    m.increment(m.counter("bruises"));
    m.registry.publish();
    rb.get().map(s => s.flatten().get("bruises")).should.eql([ 1, 2, 1, 0, 2 ]);
    (rb.getLatest().flatten().get("bruises") || 0).should.eql(2);
    m.getCounter(m.counter("bruises")).should.eql(6);
  });

  it("tracks distributions", () => {
    const rb = new RingBuffer();
    m.events.map(deltaSnapshots()).attach(rb);
    const d = m.distribution("timings", {}, [ 0.5, 0.9 ]);
    m.addDistribution(d, 2);
    m.addDistribution(d, 5);
    m.addDistribution(d, 10);
    m.registry.publish();
    m.addDistribution(d, 3);
    m.addDistribution(d, 4);
    m.addDistribution(d, 6);
    m.registry.publish();

    const flattened = rb.get().map(s => s.flatten());
    flattened.map(s => s.get("timings{p=count}")).should.eql([ 3, 3 ]);
    flattened.map(s => s.get("timings{p=0.5}")).should.eql([ 5, 4 ]);
    flattened.map(s => s.get("timings{p=0.9}")).should.eql([ 10, 6 ]);
    (rb.getLatest().flatten().get("timings{p=count}") || 0).should.eql(3);
    (rb.getLatest().flatten().get("timings{p=0.5}") || 0).should.eql(4);
  });

  it("reports missing metrics", () => {
    const rb = new RingBuffer();
    m.events.map(deltaSnapshots()).attach(rb);
    m.increment(m.counter("cats"), 3);
    m.registry.publish();
    m.increment(m.counter("cats"), 2);
    m.registry.publish();
    m.increment(m.counter("cats"), 4);
    m.increment(m.counter("dogs"), 1);
    m.registry.publish();
    m.increment(m.counter("dogs"), 7);
    m.registry.publish();

    const flattened = rb.get().map(s => s.flatten());
    flattened.map(s => s.get("cats")).should.eql([ 3, 2, 4, 0 ]);
    flattened.map(s => s.get("dogs")).should.eql([ undefined, undefined, 1, 7 ]);
    m.getCounter(m.counter("cats")).should.eql(9);
    m.getCounter(m.counter("dogs")).should.eql(8);
  });

  it("rotates correctly", () => {
    const rb = new RingBuffer({ span: m.registry.period * 5 });
    m.events.map(deltaSnapshots()).attach(rb);
    m.increment(m.counter("bugs"), 1);
    m.registry.publish();
    m.increment(m.counter("bugs"), 2);
    m.registry.publish();
    m.increment(m.counter("bugs"), 3);
    m.registry.publish();

    const flattened1 = rb.get().map(s => s.flatten());
    flattened1.map(s => s.get("bugs")).should.eql([ 1, 2, 3 ]);

    m.increment(m.counter("bugs"), 4);
    m.registry.publish();
    m.increment(m.counter("bugs"), 5);
    m.registry.publish();

    const flattened2 = rb.get().map(s => s.flatten());
    flattened2.map(s => s.get("bugs")).should.eql([ 1, 2, 3, 4, 5 ]);

    m.increment(m.counter("bugs"), 6);
    m.registry.publish();
    m.increment(m.counter("bugs"), 7);
    m.registry.publish();

    const flattened3 = rb.get().map(s => s.flatten());
    flattened3.map(s => s.get("bugs")).should.eql([ 3, 4, 5, 6, 7 ]);
  });
});
