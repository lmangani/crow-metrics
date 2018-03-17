import { Metrics, MetricType, Snapshot } from "..";

import "should";
import "source-map-support/register";


function delay(msec: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, msec));
}

describe("MetricsRegistry", () => {
  let m: Metrics;

  beforeEach(() => {
    m = Metrics.create();
  });

  afterEach(() => {
    m.registry.stop();
  });

  it("remembers counters", () => {
    const c = m.counter("buckets");
    m.registry.snapshot().toString().should.eql("Snapshot(buckets=0)");
    m.increment(c, 5);
    m.registry.snapshot().toString().should.eql("Snapshot(buckets=5)");
    m.increment(c);
    m.registry.snapshot().toString().should.eql("Snapshot(buckets=6)");
    (m.registry.getOrMake(c)).getValue().should.eql(6);
    (m.registry.getOrMake(c)).name.type.should.eql(MetricType.Counter);
  });

  it("remembers gauges", () => {
    let state = 0;
    const g = m.gauge("speed");
    m.setGauge(g, 100);
    m.setGauge(m.gauge("computed", { animal: "cat" }), () => {
      state += 1;
      return state;
    });

    m.registry.getOrMake(g).getValue().should.eql(100);
    m.registry.snapshot().toString().should.eql("Snapshot(computed{animal=cat}=1, speed=100)");
    m.registry.snapshot().toString().should.eql("Snapshot(computed{animal=cat}=2, speed=100)");
  });

  it("replaces gauges", () => {
    m.setGauge(m.gauge("speed"), 100);
    m.registry.getOrMake(m.gauge("speed")).getValue().should.eql(100);
    m.setGauge(m.gauge("speed"), 150);
    m.registry.getOrMake(m.gauge("speed")).getValue().should.eql(150);
    m.setGauge(m.gauge("speed"), 130);
    m.registry.snapshot().toString().should.eql("Snapshot(speed=130)");
  });

  it("removes gauges", () => {
    m.setGauge(m.gauge("speed"), 100);
    m.setGauge(m.gauge("height"), 78);
    m.registry.snapshot().toString().should.eql("Snapshot(height=78, speed=100)");
    m.removeGauge(m.gauge("speed"));
    m.registry.snapshot().toString().should.eql("Snapshot(height=78)");
  });

  it("remembers distributions", () => {
    const d = m.distribution("stars", {}, [ 0.5, 0.9 ]);
    m.addDistribution(d, [ 10, 20, 30 ]);
    m.registry.snapshot().toString().should.eql("Snapshot(" + [
      "stars{p=0.5}=20",
      "stars{p=0.9}=30",
      "stars{p=count}=3",
      "stars{p=sum}=60"
    ].join(", ") + ")");

    const d2 = m.distribution("stars", { galaxy: "1a" }, [ 0.5, 0.9 ]);
    m.addDistribution(d2, [ 100, 300, 500 ]);
    m.registry.snapshot().toString().should.eql("Snapshot(" + [
      "stars{galaxy=1a,p=0.5}=300",
      "stars{galaxy=1a,p=0.9}=500",
      "stars{galaxy=1a,p=count}=3",
      "stars{galaxy=1a,p=sum}=900"
    ].join(", ") + ")");
  });

  it("records times in distributions", () => {
    const d = m.distribution("stars", {}, [ 0.5, 0.9 ]);
    m.time(d, () => "hi").should.eql("hi");
    return m.timePromise(d, () => delay(50).then(() => 99)).then(rv => {
      rv.should.eql(99);
      const snapshot = m.registry.snapshot().flatten();
      (snapshot.get("stars{p=count}") as any).should.eql(2);
      (snapshot.get("stars{p=sum}") as any).should.be.greaterThan(49);
      (snapshot.get("stars{p=0.5}") as any).should.be.greaterThan(49);
    });
  });

  it("tracks tags", () => {
    const c = m.counter("buckets", { city: "San Jose" });
    m.increment(c, 3);
    const c2 = m.counter("buckets", { contents: "fire" });
    m.increment(c2, 10);
    m.registry.snapshot().toString().should.eql("Snapshot(buckets{city=San Jose}=3, buckets{contents=fire}=10)");
  });

  it("honors default tags", () => {
    m.registry.stop();
    m = Metrics.create({ tags: { instance: "i-ffff" } });
    m.increment(m.counter("a", { city: "San Jose" }));
    m.increment(m.counter("b", { instance: "i-0000" }));
    m.setGauge(m.gauge("c", { city: "Berryessa" }), 100);
    m.setGauge(m.gauge("d", { instance: "i-1111" }), 100);
    m.addDistribution(m.distribution("e", { city: "Alum Rock" }, [ 0.5 ]), 1);
    m.addDistribution(m.distribution("f", { instance: "i-2222" }, [ 0.5 ]), 1);

    Array.from(m.registry.snapshot().flatten().keys()).sort().should.eql([
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
    m.increment(m.counter("buckets", { city: "San Jose" }), 10);
    m.increment(m.counter("cats"), 900);
    m.increment(m.counter("buckets", { contents: "fire" }),3);
    m.setGauge(m.gauge("speed"), 150);
    m.addDistribution(m.distribution("stars", { galaxy: "1a" }), [ 90, 100, 110 ]);
    Array.from(m.registry.snapshot().flatten()).sort().should.eql([
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
    m.registry.stop();
    m = Metrics.create({ period: 10 });
    m.events.forEach(snapshot => captured.push(snapshot));
    m.increment(m.counter("buckets"), 5);
    return delay(13).then(() => {
      m.increment(m.counter("buckets"), 3);
      return delay(13).then(() => {
        captured.length.should.eql(2);
        Array.from(captured[0].flatten()).should.eql([ [ "buckets", 5 ] ]);
        Array.from(captured[1].flatten()).should.eql([ [ "buckets", 8 ] ]);
        (captured[1].timestamp - captured[0].timestamp).should.be.greaterThan(8);
      });
    });
  });

  it("refuses to let two metrics have the same name", () => {
    m.setGauge(m.gauge("buckets"), 10);
    (() => m.counter("buckets")).should.throw("buckets is already a Gauge");
    (() => m.distribution("buckets")).should.throw("buckets is already a Gauge");
  });

  it("can sub-divide by prefix", () => {
    const mm = m.withPrefix("myserver_");
    mm.setGauge(mm.gauge("gauge"), 10);
    mm.increment(mm.counter("counter"), 3);
    mm.addDistribution(mm.distribution("dist", {}, [ 0.5 ]), 100);
    const m2 = mm.withPrefix("moar_");
    m2.increment(m2.counter("wut"), 8);

    Array.from(m.registry.snapshot().flatten().keys()).sort().should.eql([
      "myserver_counter",
      "myserver_dist{p=0.5}",
      "myserver_dist{p=count}",
      "myserver_dist{p=sum}",
      "myserver_gauge",
      "myserver_moar_wut"
    ]);

    const m3 = Metrics.create();
    try {
      const mm = m3.withPrefix("prod.").withPrefix("racetrack.");
      m3.increment(mm.counter("requests"));
      Array.from(m3.registry.snapshot().flatten().keys()).sort().should.eql([
        "prod.racetrack.requests"
      ]);
    } finally {
      m3.registry.stop();
    }
  });

  it("can sub-divide by tags", () => {
    const mm = m.withTags({ instanceId: "i-ff00ff00" });
    mm.increment(mm.counter("widgets"));
    mm.increment(mm.counter("errors", { code: "500" }));
    Array.from(m.registry.snapshot().flatten().keys()).sort().should.eql([
      "errors{code=500,instanceId=i-ff00ff00}",
      "widgets{instanceId=i-ff00ff00}",
    ]);
  });

  it("expires unused counters and distributions", async () => {
    const snapshots: Snapshot[] = [];
    m.registry.stop();
    m = Metrics.create({ expire: 25 });
    m.events.forEach(s => snapshots.push(s));

    m.increment(m.counter("old"), 5);
    m.increment(m.counter("new"), 5);
    m.addDistribution(m.distribution("old2"), 1);
    m.addDistribution(m.distribution("new2"), 1);
    m.registry.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name).keys()).sort().should.eql([
      "new", "new2", "old", "old2"
    ]);

    m.registry.publish(Date.now() + 10);
    Array.from(snapshots[1].flatten(n => n.name).keys()).sort().should.eql([
      "new", "old"
    ]);

    await delay(25);
    m.increment(m.counter("new"), 5);
    m.addDistribution(m.distribution("new2"), 1);
    m.registry.publish(Date.now());
    Array.from(snapshots[2].flatten(n => n.name).keys()).sort().should.eql([
      "new", "new2"
    ]);
  });

  it("reifies counters that expired but have live references", async () => {
    m.registry.stop();
    m = Metrics.create({ expire: 25 });
    const snapshots: Snapshot[] = [];
    m.events.forEach(s => snapshots.push(s));

    const counter = m.counter("old");
    (m.registry.get(counter) == null).should.eql(false);

    m.increment(counter, 5);
    m.registry.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name)).sort().should.eql([
      [ "old", 5 ]
    ]);

    m.registry.publish(Date.now() + 10);
    await delay(25);

    // no counter! it's gone!
    m.registry.publish(Date.now());
    Array.from(snapshots[2].flatten(n => n.name)).sort().should.eql([]);
    (m.registry.get(counter) == null).should.eql(true);

    m.increment(counter, 3);
    (m.registry.get(counter) == null).should.eql(false);

    m.registry.publish(Date.now() + 10);
    Array.from(snapshots[3].flatten(n => n.name)).sort().should.eql([
      [ "old", 3 ]
    ]);
    await delay(25);

    m.registry.publish(Date.now());
    Array.from(snapshots[4].flatten(n => n.name)).sort().should.eql([]);
    (m.registry.get(counter) == null).should.eql(true);

    m.increment(counter, 9);
    (m.registry.get(counter) == null).should.eql(false);

    m.registry.publish(Date.now() + 10);
    Array.from(snapshots[5].flatten(n => n.name)).sort().should.eql([
      [ "old", 9 ]
    ]);
  });

  it("removes gauges from later snapshots", () => {
    m.registry.stop();
    m = Metrics.create({ expire: 25 });
    const snapshots: Snapshot[] = [];
    m.events.forEach(s => snapshots.push(s));

    const aura = m.gauge("aura");
    const spirit = m.withPrefix("owl_").gauge("spirit");

    m.setGauge(aura, () => 23);
    m.setGauge(spirit, () => 17);
    m.registry.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    m.registry.publish(Date.now());
    Array.from(snapshots[1].flatten(n => n.name).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    m.removeGauge(aura);
    m.removeGauge(spirit);
    m.registry.publish(Date.now());
    Array.from(snapshots[2].flatten(n => n.name).keys()).sort().should.eql([ ]);
  });
});
