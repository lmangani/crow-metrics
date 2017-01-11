import { deltaSnapshots, MetricsRegistry, RingBufferObserver } from "..";

import "should";
import "source-map-support/register";


describe("RingBufferObserver", () => {
  it("tracks gauges", () => {
    const r = new MetricsRegistry();
    const rb = new RingBufferObserver();
    r.events.map(deltaSnapshots()).subscribe(rb);
    r.setGauge(r.gauge("speed"), 45);
    r.publish();
    r.setGauge(r.gauge("speed"), 55);
    r.publish();
    r.setGauge(r.gauge("speed"), 35);
    r.publish();
    rb.get().map(s => s.flatten().get("speed")).should.eql([ 45, 55, 35 ]);
    (rb.getLatest().flatten().get("speed") || 0).should.eql(35);
  });

  it("tracks counters", () => {
    const r = new MetricsRegistry();
    const rb = new RingBufferObserver();
    r.events.map(deltaSnapshots()).subscribe(rb);
    r.increment(r.counter("bruises"));
    r.publish();
    r.increment(r.counter("bruises"));
    r.increment(r.counter("bruises"));
    r.publish();
    r.increment(r.counter("bruises"));
    r.publish();
    r.publish();
    r.increment(r.counter("bruises"));
    r.increment(r.counter("bruises"));
    r.publish();
    rb.get().map(s => s.flatten().get("bruises")).should.eql([ 1, 2, 1, 0, 2 ]);
    (rb.getLatest().flatten().get("bruises") || 0).should.eql(2);
    r.getCounter(r.counter("bruises")).should.eql(6);
  });

  it("tracks distributions", () => {
    const r = new MetricsRegistry();
    const rb = new RingBufferObserver();
    r.events.map(deltaSnapshots()).subscribe(rb);
    const d = r.distribution("timings", {}, [ 0.5, 0.9 ]);
    r.addDistribution(d, 2);
    r.addDistribution(d, 5);
    r.addDistribution(d, 10);
    r.publish();
    r.addDistribution(d, 3);
    r.addDistribution(d, 4);
    r.addDistribution(d, 6);
    r.publish();

    const flattened = rb.get().map(s => s.flatten());
    flattened.map(s => s.get("timings{p=count}")).should.eql([ 3, 3 ]);
    flattened.map(s => s.get("timings{p=0.5}")).should.eql([ 5, 4 ]);
    flattened.map(s => s.get("timings{p=0.9}")).should.eql([ 10, 6 ]);
    (rb.getLatest().flatten().get("timings{p=count}") || 0).should.eql(3);
    (rb.getLatest().flatten().get("timings{p=0.5}") || 0).should.eql(4);
  });

  it("reports missing metrics", () => {
    const r = new MetricsRegistry();
    const rb = new RingBufferObserver();
    r.events.map(deltaSnapshots()).subscribe(rb);
    r.increment(r.counter("cats"), 3);
    r.publish();
    r.increment(r.counter("cats"), 2);
    r.publish();
    r.increment(r.counter("cats"), 4);
    r.increment(r.counter("dogs"), 1);
    r.publish();
    r.increment(r.counter("dogs"), 7);
    r.publish();

    const flattened = rb.get().map(s => s.flatten());
    flattened.map(s => s.get("cats")).should.eql([ 3, 2, 4, 0 ]);
    flattened.map(s => s.get("dogs")).should.eql([ undefined, undefined, 1, 7 ]);
    r.getCounter(r.counter("cats")).should.eql(9);
    r.getCounter(r.counter("dogs")).should.eql(8);
  });

  it("rotates correctly", () => {
    const r = new MetricsRegistry();
    const rb = new RingBufferObserver({ span: r.period * 5 });
    r.events.map(deltaSnapshots()).subscribe(rb);
    r.increment(r.counter("bugs"), 1);
    r.publish();
    r.increment(r.counter("bugs"), 2);
    r.publish();
    r.increment(r.counter("bugs"), 3);
    r.publish();

    const flattened1 = rb.get().map(s => s.flatten());
    flattened1.map(s => s.get("bugs")).should.eql([ 1, 2, 3 ]);

    r.increment(r.counter("bugs"), 4);
    r.publish();
    r.increment(r.counter("bugs"), 5);
    r.publish();

    const flattened2 = rb.get().map(s => s.flatten());
    flattened2.map(s => s.get("bugs")).should.eql([ 1, 2, 3, 4, 5 ]);

    r.increment(r.counter("bugs"), 6);
    r.publish();
    r.increment(r.counter("bugs"), 7);
    r.publish();

    const flattened3 = rb.get().map(s => s.flatten());
    flattened3.map(s => s.get("bugs")).should.eql([ 3, 4, 5, 6, 7 ]);
  });
});
