import { MetricsRegistry, MetricType, Snapshot } from "..";

import "should";
import "source-map-support/register";


function delay(msec: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, msec));
}

describe("MetricsRegistry", () => {
  let r: MetricsRegistry;

  beforeEach(() => {
    r = new MetricsRegistry();
  });

  afterEach(() => {
    r.stop();
  });

  it("remembers counters", () => {
    const c = r.metrics.counter("buckets");
    r.snapshot().toString().should.eql("Snapshot(buckets=0)");
    r.metrics.increment(c, 5);
    r.snapshot().toString().should.eql("Snapshot(buckets=5)");
    r.metrics.increment(c);
    r.snapshot().toString().should.eql("Snapshot(buckets=6)");
    (r.getOrMake(c)).getValue().should.eql(6);
    (r.getOrMake(c)).name.type.should.eql(MetricType.Counter);
  });

  it("remembers gauges", () => {
    let state = 0;
    const g = r.metrics.gauge("speed");
    r.metrics.setGauge(g, 100);
    r.metrics.setGauge(r.metrics.gauge("computed", { animal: "cat" }), () => {
      state += 1;
      return state;
    });

    r.getOrMake(g).getValue().should.eql(100);
    r.snapshot().toString().should.eql("Snapshot(computed{animal=cat}=1, speed=100)");
    r.snapshot().toString().should.eql("Snapshot(computed{animal=cat}=2, speed=100)");
  });

  it("replaces gauges", () => {
    r.metrics.setGauge(r.metrics.gauge("speed"), 100);
    r.getOrMake(r.metrics.gauge("speed")).getValue().should.eql(100);
    r.metrics.setGauge(r.metrics.gauge("speed"), 150);
    r.getOrMake(r.metrics.gauge("speed")).getValue().should.eql(150);
    r.metrics.setGauge(r.metrics.gauge("speed"), 130);
    r.snapshot().toString().should.eql("Snapshot(speed=130)");
  });

  it("removes gauges", () => {
    r.metrics.setGauge(r.metrics.gauge("speed"), 100);
    r.metrics.setGauge(r.metrics.gauge("height"), 78);
    r.snapshot().toString().should.eql("Snapshot(height=78, speed=100)");
    r.metrics.removeGauge(r.metrics.gauge("speed"));
    r.snapshot().toString().should.eql("Snapshot(height=78)");
  });

  it("remembers distributions", () => {
    const d = r.metrics.distribution("stars", {}, [ 0.5, 0.9 ]);
    r.metrics.addDistribution(d, [ 10, 20, 30 ]);
    r.snapshot().toString().should.eql("Snapshot(" + [
      "stars{p=0.5}=20",
      "stars{p=0.9}=30",
      "stars{p=count}=3",
      "stars{p=sum}=60"
    ].join(", ") + ")");

    const d2 = r.metrics.distribution("stars", { galaxy: "1a" }, [ 0.5, 0.9 ]);
    r.metrics.addDistribution(d2, [ 100, 300, 500 ]);
    r.snapshot().toString().should.eql("Snapshot(" + [
      "stars{galaxy=1a,p=0.5}=300",
      "stars{galaxy=1a,p=0.9}=500",
      "stars{galaxy=1a,p=count}=3",
      "stars{galaxy=1a,p=sum}=900"
    ].join(", ") + ")");
  });

  it("records times in distributions", () => {
    const d = r.metrics.distribution("stars", {}, [ 0.5, 0.9 ]);
    r.metrics.time(d, () => "hi").should.eql("hi");
    return r.metrics.timePromise(d, () => delay(50).then(() => 99)).then(rv => {
      rv.should.eql(99);
      const snapshot = r.snapshot().flatten();
      (snapshot.get("stars{p=count}") as any).should.eql(2);
      (snapshot.get("stars{p=sum}") as any).should.be.greaterThan(49);
      (snapshot.get("stars{p=0.5}") as any).should.be.greaterThan(49);
    });
  });

  it("tracks tags", () => {
    const c = r.metrics.counter("buckets", { city: "San Jose" });
    r.metrics.increment(c, 3);
    const c2 = r.metrics.counter("buckets", { contents: "fire" });
    r.metrics.increment(c2, 10);
    r.snapshot().toString().should.eql("Snapshot(buckets{city=San Jose}=3, buckets{contents=fire}=10)");
  });

  it("honors default tags", () => {
    r.stop();
    r = new MetricsRegistry({ tags: { instance: "i-ffff" } });
    r.metrics.increment(r.metrics.counter("a", { city: "San Jose" }));
    r.metrics.increment(r.metrics.counter("b", { instance: "i-0000" }));
    r.metrics.setGauge(r.metrics.gauge("c", { city: "Berryessa" }), 100);
    r.metrics.setGauge(r.metrics.gauge("d", { instance: "i-1111" }), 100);
    r.metrics.addDistribution(r.metrics.distribution("e", { city: "Alum Rock" }, [ 0.5 ]), 1);
    r.metrics.addDistribution(r.metrics.distribution("f", { instance: "i-2222" }, [ 0.5 ]), 1);

    Array.from(r.snapshot().flatten().keys()).sort().should.eql([
      `a{city=San Jose,instance=i-ffff}`,
      `b{instance=i-0000}`,
      `c{city=Berryessa,instance=i-ffff}`,
      `d{instance=i-1111}`,
      `e{city=Alum Rock,instance=i-ffff,p=0.5}`,
      `e{city=Alum Rock,instance=i-ffff,p=count}`,
      `e{city=Alum Rock,instance=i-ffff,p=sum}`,
      `f{instance=i-2222,p=0.5}`,
      `f{instance=i-2222,p=count}`,
      `f{instance=i-2222,p=sum}`
    ]);
  });

  it("makes a snapshot", () => {
    r.metrics.increment(r.metrics.counter("buckets", { city: "San Jose" }), 10);
    r.metrics.increment(r.metrics.counter("cats"), 900);
    r.metrics.increment(r.metrics.counter("buckets", { contents: "fire" }),3);
    r.metrics.setGauge(r.metrics.gauge("speed"), 150);
    r.metrics.addDistribution(r.metrics.distribution("stars", { galaxy: "1a" }), [ 90, 100, 110 ]);
    Array.from(r.snapshot().flatten()).sort().should.eql([
      [ "buckets{city=San Jose}", 10 ],
      [ "buckets{contents=fire}", 3 ],
      [ "cats", 900 ],
      [ "speed", 150 ],
      [ "stars{galaxy=1a,p=0.5}", 100 ],
      [ "stars{galaxy=1a,p=0.99}", 110 ],
      [ "stars{galaxy=1a,p=0.9}", 110 ],
      [ "stars{galaxy=1a,p=count}", 3 ],
      [ "stars{galaxy=1a,p=sum}", 300 ]
    ]);
  });

  it("publishes to observers", () => {
    const captured: Snapshot[] = [];
    r.stop();
    r = new MetricsRegistry({ period: 10 });
    r.events.forEach(snapshot => captured.push(snapshot));
    r.metrics.increment(r.metrics.counter("buckets"), 5);
    return delay(13).then(() => {
      r.metrics.increment(r.metrics.counter("buckets"), 3);
      return delay(13).then(() => {
        captured.length.should.eql(2);
        Array.from(captured[0].flatten()).should.eql([ [ "buckets", 5 ] ]);
        Array.from(captured[1].flatten()).should.eql([ [ "buckets", 8 ] ]);
        (captured[1].timestamp - captured[0].timestamp).should.be.greaterThan(8);
      });
    });
  });

  it("refuses to let two metrics have the same name", () => {
    r.metrics.setGauge(r.metrics.gauge("buckets"), 10);
    (() => r.metrics.counter("buckets")).should.throw("buckets is already a Gauge");
    (() => r.metrics.distribution("buckets")).should.throw("buckets is already a Gauge");
  });

  it("can sub-divide by prefix", () => {
    const m = r.metrics.withPrefix("myserver");
    m.setGauge(m.gauge("gauge"), 10);
    m.increment(m.counter("counter"), 3);
    m.addDistribution(m.distribution("dist", {}, [ 0.5 ]), 100);
    const m2 = m.withPrefix("moar");
    m2.increment(m2.counter("wut"), 8);

    Array.from(r.snapshot().flatten().keys()).sort().should.eql([
      "myserver_counter",
      "myserver_dist{p=0.5}",
      "myserver_dist{p=count}",
      "myserver_dist{p=sum}",
      "myserver_gauge",
      "myserver_moar_wut"
    ]);

    const rr = new MetricsRegistry({ separator: "." });
    try {
      const mm = rr.metrics.withPrefix("prod").withPrefix("racetrack");
      rr.metrics.increment(mm.counter("requests"));
      Array.from(rr.snapshot().flatten().keys()).sort().should.eql([
        "prod.racetrack.requests"
      ]);
    } finally {
      rr.stop();
    }
  });

  it("expires unused counters and distributions", async () => {
    r.stop();
    r = new MetricsRegistry({ expire: 25 });
    const snapshots: Snapshot[] = [];
    r.events.forEach(s => snapshots.push(s));

    const m = r.metrics;
    m.increment(m.counter("old"), 5);
    m.increment(m.counter("new"), 5);
    m.addDistribution(m.distribution("old2"), 1);
    m.addDistribution(m.distribution("new2"), 1);
    r.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name).keys()).sort().should.eql([
      "new", "new2", "old", "old2"
    ]);

    r.publish(Date.now() + 10);
    Array.from(snapshots[1].flatten(n => n.name).keys()).sort().should.eql([
      "new", "old"
    ]);

    await delay(25);
    m.increment(m.counter("new"), 5);
    m.addDistribution(m.distribution("new2"), 1);
    r.publish(Date.now());
    Array.from(snapshots[2].flatten(n => n.name).keys()).sort().should.eql([
      "new", "new2"
    ]);
  });

  it("reifies counters that expired but have live references", async () => {
    r.stop();
    r = new MetricsRegistry({ expire: 25 });
    const snapshots: Snapshot[] = [];
    const m = r.metrics;
    r.events.forEach(s => snapshots.push(s));

    const counter = m.counter("old");
    (r.get(counter) == null).should.eql(false);

    m.increment(counter, 5);
    r.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name)).sort().should.eql([
      [ "old", 5 ]
    ]);

    r.publish(Date.now() + 10);
    await delay(25);

    // no counter! it's gone!
    r.publish(Date.now());
    Array.from(snapshots[2].flatten(n => n.name)).sort().should.eql([]);
    (r.get(counter) == null).should.eql(true);

    m.increment(counter, 3);
    (r.get(counter) == null).should.eql(false);

    r.publish(Date.now() + 10);
    Array.from(snapshots[3].flatten(n => n.name)).sort().should.eql([
      [ "old", 3 ]
    ]);
    await delay(25);

    r.publish(Date.now());
    Array.from(snapshots[4].flatten(n => n.name)).sort().should.eql([]);
    (r.get(counter) == null).should.eql(true);

    m.increment(counter, 9);
    (r.get(counter) == null).should.eql(false);

    r.publish(Date.now() + 10);
    Array.from(snapshots[5].flatten(n => n.name)).sort().should.eql([
      [ "old", 9 ]
    ]);
  });

  it("removes gauges from later snapshots", () => {
    r.stop();
    r = new MetricsRegistry({ expire: 25 });
    const snapshots: Snapshot[] = [];
    const m = r.metrics;
    r.events.forEach(s => snapshots.push(s));

    const aura = m.gauge("aura");
    const spirit = m.withPrefix("owl").gauge("spirit");

    m.setGauge(aura, () => 23);
    m.setGauge(spirit, () => 17);
    r.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    r.publish(Date.now());
    Array.from(snapshots[1].flatten(n => n.name).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    m.removeGauge(aura);
    m.removeGauge(spirit);
    r.publish(Date.now());
    Array.from(snapshots[2].flatten(n => n.name).keys()).sort().should.eql([ ]);
  });
});
