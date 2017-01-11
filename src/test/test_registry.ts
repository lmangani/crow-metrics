import { MetricsRegistry, MetricType, Snapshot } from "..";

import "should";
import "source-map-support/register";


function delay(msec: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, msec));
}

describe("MetricsRegistry", () => {
  it("remembers counters", () => {
    const r = new MetricsRegistry();
    const c = r.counter("buckets");
    r.snapshot().toString().should.eql("Snapshot(buckets=0)");
    r.increment(c, 5);
    r.snapshot().toString().should.eql("Snapshot(buckets=5)");
    r.increment(c);
    r.snapshot().toString().should.eql("Snapshot(buckets=6)");
    (r.metrics.get("buckets") as any).value.should.eql(6);
    (r.metrics.get("buckets") as any).type.should.eql(MetricType.Counter);
  });

  it("remembers gauges", () => {
    let state = 0;
    const r = new MetricsRegistry();
    const g = r.gauge("speed");
    r.setGauge(g, 100);
    r.setGauge(r.gauge("computed", { animal: "cat" }), () => {
      state += 1;
      return state;
    });

    (r.metrics.get("speed") as any).value.should.eql(100);
    r.snapshot().toString().should.eql("Snapshot(computed{animal=cat}=1, speed=100)");
    r.snapshot().toString().should.eql("Snapshot(computed{animal=cat}=2, speed=100)");
  });

  it("replaces gauges", () => {
    const r = new MetricsRegistry();
    r.setGauge(r.gauge("speed"), 100);
    (r.metrics.get("speed") as any).value.should.eql(100);
    r.setGauge(r.gauge("speed"), 150);
    (r.metrics.get("speed") as any).value.should.eql(150);
    r.setGauge(r.gauge("speed"), 130);
    r.snapshot().toString().should.eql("Snapshot(speed=130)");
  });

  it("removes gauges", () => {
    const r = new MetricsRegistry();
    r.setGauge(r.gauge("speed"), 100);
    r.setGauge(r.gauge("height"), 78);
    r.snapshot().toString().should.eql("Snapshot(height=78, speed=100)");
    r.removeGauge(r.gauge("speed"));
    r.snapshot().toString().should.eql("Snapshot(height=78)");
  });

  it("remembers distributions", () => {
    const r = new MetricsRegistry();
    const d = r.distribution("stars", {}, [ 0.5, 0.9 ]);
    r.addDistribution(d, [ 10, 20, 30 ]);
    r.snapshot().toString().should.eql("Snapshot(" + [
      "stars{p=0.5}=20",
      "stars{p=0.9}=30",
      "stars{p=count}=3",
      "stars{p=sum}=60"
    ].join(", ") + ")");

    const d2 = r.distribution("stars", { galaxy: "1a" }, [ 0.5, 0.9 ]);
    r.addDistribution(d2, [ 100, 300, 500 ]);
    r.snapshot().toString().should.eql("Snapshot(" + [
      "stars{galaxy=1a,p=0.5}=300",
      "stars{galaxy=1a,p=0.9}=500",
      "stars{galaxy=1a,p=count}=3",
      "stars{galaxy=1a,p=sum}=900"
    ].join(", ") + ")");
  });

  it("records times in distributions", () => {
    const r = new MetricsRegistry();
    const d = r.distribution("stars", {}, [ 0.5, 0.9 ]);
    r.time(d, () => "hi").should.eql("hi");
    return r.timePromise(d, () => delay(50).then(() => 99)).then(rv => {
      rv.should.eql(99);
      const snapshot = r.snapshot().flatten();
      (snapshot.get("stars{p=count}") as any).should.eql(2);
      (snapshot.get("stars{p=sum}") as any).should.be.greaterThan(49);
      (snapshot.get("stars{p=0.5}") as any).should.be.greaterThan(49);
    });
  });

  it("tracks tags", () => {
    const r = new MetricsRegistry();
    const c = r.counter("buckets", { city: "San Jose" });
    r.increment(c, 3);
    r.increment(c.removeTags("city").addTags({ contents: "fire" }), 10);
    r.snapshot().toString().should.eql("Snapshot(buckets{city=San Jose}=3, buckets{contents=fire}=10)");
  });

  it("honors default tags", () => {
    const r = new MetricsRegistry({ tags: { instance: "i-ffff" } });
    r.counter("a", { city: "San Jose" });
    r.counter("b", { instance: "i-0000" });
    r.setGauge(r.gauge("c", { city: "Berryessa" }), 100);
    r.setGauge(r.gauge("d", { instance: "i-1111" }), 100);
    r.addDistribution(r.distribution("e", { city: "Alum Rock" }, [ 0.5 ]), 1);
    r.addDistribution(r.distribution("f", { instance: "i-2222" }, [ 0.5 ]), 1);

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
    const r = new MetricsRegistry();
    r.increment(r.counter("buckets", { city: "San Jose" }), 10);
    r.increment(r.counter("cats"), 900);
    r.increment(r.counter("buckets", { contents: "fire" }),3);
    r.setGauge(r.gauge("speed"), 150);
    r.addDistribution(r.distribution("stars").addTags({ galaxy: "1a" }), [ 90, 100, 110 ]);
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
    const r = new MetricsRegistry({ period: 10 });
    r.events.subscribe(snapshot => captured.push(snapshot));
    r.increment(r.counter("buckets"), 5);
    return delay(13).then(() => {
      r.increment(r.counter("buckets"), 3);
      return delay(13).then(() => {
        captured.length.should.eql(2);
        Array.from(captured[0].flatten()).should.eql([ [ "buckets", 5 ] ]);
        Array.from(captured[1].flatten()).should.eql([ [ "buckets", 8 ] ]);
        (captured[1].timestamp - captured[0].timestamp).should.be.greaterThan(8);
      });
    });
  });

  it("refuses to let two metrics have the same name", () => {
    const r = new MetricsRegistry();
    r.setGauge(r.gauge("buckets"), 10);
    (() => r.counter("buckets")).should.throw("buckets is already a Gauge");
    (() => r.distribution("buckets")).should.throw("buckets is already a Gauge");
  });

  it("can sub-divide by prefix", () => {
    const r = new MetricsRegistry();
    const r2 = r.withPrefix("myserver");
    r2.setGauge(r2.gauge("gauge"), 10);
    r2.increment(r2.counter("counter"), 3);
    r2.addDistribution(r2.distribution("dist", {}, [ 0.5 ]), 100);
    const r3 = r2.withPrefix("moar");
    r3.increment(r3.counter("wut"), 8);

    Array.from(r.snapshot().flatten().keys()).sort().should.eql([
      "myserver_counter",
      "myserver_dist{p=0.5}",
      "myserver_dist{p=count}",
      "myserver_dist{p=sum}",
      "myserver_gauge",
      "myserver_moar_wut"
    ]);

    const rr = new MetricsRegistry({ separator: "." });
    const rr2 = rr.withPrefix("prod").withPrefix("racetrack");
    rr.increment(rr2.counter("requests"));
    Array.from(rr.snapshot().flatten().keys()).sort().should.eql([
      "prod.racetrack.requests"
    ]);
  });

  it("expires unused counters and distributions", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry({ expire: 25 });
    r.events.subscribe(s => snapshots.push(s));

    r.increment(r.counter("old"), 5);
    r.increment(r.counter("new"), 5);
    r.addDistribution(r.distribution("old2"), 1);
    r.addDistribution(r.distribution("new2"), 1);
    r.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name).keys()).sort().should.eql([
      "new", "new2", "old", "old2"
    ]);

    r.publish(Date.now() + 10);
    Array.from(snapshots[1].flatten(n => n.name).keys()).sort().should.eql([
      "new", "old"
    ]);

    return delay(25).then(() => {
      r.increment(r.counter("new"), 5);
      r.addDistribution(r.distribution("new2"), 1);
      r.publish(Date.now());
      Array.from(snapshots[2].flatten(n => n.name).keys()).sort().should.eql([
        "new", "new2"
      ]);
    });
  });

  it("revivifies counters that expired but have live references", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry({ expire: 25 });
    r.events.subscribe(s => snapshots.push(s));

    const counter = r.counter("old");
    (r.metrics.get(counter.canonical) == null).should.eql(false);

    r.increment(counter, 5);
    r.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name)).sort().should.eql([
      [ "old", 5 ]
    ]);

    r.publish(Date.now() + 10);

    return delay(25).then(() => {
      // no counter! it's gone!
      r.publish(Date.now());
      Array.from(snapshots[2].flatten(n => n.name)).sort().should.eql([]);
      (r.metrics.get(counter.canonical) == null).should.eql(true);

      r.increment(counter, 3);
      (r.metrics.get(counter.canonical) == null).should.eql(false);

      r.publish(Date.now() + 10);
      Array.from(snapshots[3].flatten(n => n.name)).sort().should.eql([
        [ "old", 3 ]
      ]);

      return delay(25);
    }).then(() => {
      r.publish(Date.now());
      Array.from(snapshots[4].flatten(n => n.name)).sort().should.eql([]);
      (r.metrics.get(counter.canonical) == null).should.eql(true);

      r.increment(counter, 9);
      (r.metrics.get(counter.canonical) == null).should.eql(false);

      r.publish(Date.now() + 10);
      Array.from(snapshots[5].flatten(n => n.name)).sort().should.eql([
        [ "old", 9 ]
      ]);
    });
  });

  it("removes gauges from later snapshots", () => {
    const snapshots: Snapshot[] = [];
    const r = new MetricsRegistry({ expire: 25 });
    r.events.subscribe(s => snapshots.push(s));

    const aura = r.gauge("aura");
    const spirit = r.withPrefix("owl").gauge("spirit");

    r.setGauge(aura, () => 23);
    r.setGauge(spirit, () => 17);
    r.publish(Date.now());
    Array.from(snapshots[0].flatten(n => n.name).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    r.publish(Date.now());
    Array.from(snapshots[1].flatten(n => n.name).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    r.removeGauge(aura);
    r.removeGauge(spirit);
    r.publish(Date.now());
    Array.from(snapshots[2].flatten(n => n.name).keys()).sort().should.eql([ ]);
  });
});
