"use strict";

import { MetricsRegistry } from "../../lib";
import Promise from "bluebird";

import "should";
import "source-map-support/register";


describe("MetricsRegistry", () => {
  it("remembers counters", () => {
    const r = new MetricsRegistry();
    const c = r.counter("buckets");
    c.value.should.eql(0);
    c.increment(5);
    c.value.should.eql(5);
    c.increment();
    c.value.should.eql(6);
    r.counter("buckets").value.should.eql(6);
    r.snapshot().flatten().get("buckets").should.eql({ value: 6, type: "counter" });
  });

  it("remembers gauges", () => {
    let state = 0;
    const r = new MetricsRegistry();
    r.setGauge("speed", 100);
    r.setGauge("computed", { animal: "cat" }, () => {
      state += 1;
      return state;
    });
    r.gauge("speed").value.should.eql(100);
    r.gauge("computed", { animal: "cat" }).value.should.eql(1);
    r.gauge("computed", { animal: "cat" }).value.should.eql(2);
  });

  it("replaces gauges", () => {
    const r = new MetricsRegistry();
    r.setGauge("speed", 100);
    r.gauge("speed").value.should.eql(100);
    r.setGauge("speed", 150);
    r.gauge("speed").value.should.eql(150);
    r.setGauge("speed", 130);
    r.snapshot().flatten().get("speed").should.eql({ value: 130, type: "gauge" });
  });

  it("remembers distributions", () => {
    const r = new MetricsRegistry();
    const d = r.distribution("stars", {}, [ 0.5, 0.9 ]);
    d.add([ 10, 20, 30 ]);
    Array.from(d.value).should.eql([
      [ "0.5", 20 ],
      [ "0.9", 30 ],
      [ "count", 3 ],
      [ "sum", 60 ]
    ]);

    const d2 = r.distribution("stars", { galaxy: "1a" }, [ 0.5, 0.9 ]);
    d2.add([ 100, 300, 500 ]);
    const map = r.distribution("stars", { galaxy: "1a" }).value;
    Array.from(map).should.eql([
      [ "0.5", 300 ],
      [ "0.9", 500 ],
      [ "count", 3 ],
      [ "sum", 900 ]
    ]);
  });

  it("records times in distributions", done => {
    const r = new MetricsRegistry();
    const d = r.distribution("stars", {}, [ 0.5, 0.9 ]);
    d.time(() => "hi").should.eql("hi");
    d.time(() => Promise.delay(50).then(() => 99)).then(rv => {
      rv.should.eql(99);
      const stats = d.value;
      stats.get("count").should.eql(2);
      stats.get("sum").should.be.greaterThan(49);
      stats.get("0.5").should.be.greaterThan(49);
      done();
    });
  });

  it("tracks tags", () => {
    const r = new MetricsRegistry();
    const c = r.counter("buckets", { city: "San Jose" });
    c.increment(3);
    c.withTags({ city: null, contents: "fire" }).increment(10);
    r.counter("buckets", { contents: "fire" }).value.should.eql(10);
  });

  it("honors default tags", () => {
    const r = new MetricsRegistry({ tags: { instance: "i-ffff" } });
    r.counter("a", { city: "San Jose" });
    r.counter("b", { instance: "i-0000" });
    r.setGauge("c", { city: "Berryessa" }, 100);
    r.setGauge("d", { instance: "i-1111" }, 100);
    r.distribution("e", { city: "Alum Rock" }, [ 0.5 ]).add(1);
    r.distribution("f", { instance: "i-2222" }, [ 0.5 ]).add(1);

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
    r.counter("buckets", { city: "San Jose" }).increment(10);
    r.counter("cats").increment(900);
    r.counter("buckets", { contents: "fire" }).increment(3);
    r.setGauge("speed", 150);
    r.distribution("stars").withTags({ galaxy: "1a" }).add([ 90, 100, 110 ]);
    Array.from(r.snapshot().flatten()).sort().should.eql([
      [ "buckets{city=San Jose}", { value: 10, type: "counter" } ],
      [ "buckets{contents=fire}", { value: 3, type: "counter" } ],
      [ "cats", { value: 900, type: "counter" } ],
      [ "speed", { value: 150, type: "gauge" } ],
      [ "stars{galaxy=1a,p=0.5}", { value: 100, type: "distribution" } ],
      [ "stars{galaxy=1a,p=0.99}", { value: 110, type: "distribution" } ],
      [ "stars{galaxy=1a,p=0.9}", { value: 110, type: "distribution" } ],
      [ "stars{galaxy=1a,p=count}", { value: 3, type: "distribution" } ],
      [ "stars{galaxy=1a,p=sum}", { value: 300, type: "distribution" } ]
    ]);
  });

  it("publishes to observers", done => {
    const captured = [];
    const r = new MetricsRegistry({ period: 10 });
    r.addObserver(snapshot => captured.push(snapshot));
    r.counter("buckets").increment(5);
    setTimeout(() => {
      r.counter("buckets").increment(3);
      setTimeout(() => {
        captured.length.should.eql(2);
        Array.from(captured[0].flatten()).should.eql([ [ "buckets", { value: 5, type: "counter" } ] ]);
        Array.from(captured[1].flatten()).should.eql([ [ "buckets", { value: 8, type: "counter" } ] ]);
        (captured[1].timestamp - captured[0].timestamp).should.be.greaterThan(8);
        done();
      }, 13);
    }, 13);
  });

  it("refuses to let two metrics have the same name", () => {
    const r = new MetricsRegistry();
    r.setGauge("buckets", 10);
    (() => r.counter("buckets")).should.throw("buckets is already a gauge");
    (() => r.distribution("buckets")).should.throw("buckets is already a gauge");
  });

  it("can sub-divide by prefix", () => {
    const r = new MetricsRegistry();
    const r2 = r.withPrefix("myserver");
    r2.setGauge("gauge", 10);
    r2.counter("counter").increment(3);
    r2.distribution("dist", {}, [ 0.5 ]).add(100);
    const r3 = r2.withPrefix("moar");
    r3.counter("wut").increment(8);

    Array.from(r.snapshot().flatten().keys()).sort().should.eql([
      "myserver_counter",
      "myserver_dist{p=0.5}",
      "myserver_dist{p=count}",
      "myserver_dist{p=sum}",
      "myserver_gauge",
      "myserver_moar_wut"
    ]);

    const rr = new MetricsRegistry({ separator: "." });
    rr.withPrefix("prod").withPrefix("racetrack").counter("requests").increment();
    Array.from(rr.snapshot().flatten().keys()).sort().should.eql([
      "prod.racetrack.requests"
    ]);
  });

  it("expires unused counters and distributions", done => {
    const snapshots = [];
    const r = new MetricsRegistry({ expire: 25 });
    r.addObserver(s => snapshots.push(s));

    r.counter("old").increment(5);
    r.counter("new").increment(5);
    r.distribution("old2").add(1);
    r.distribution("new2").add(1);
    r._publish(Date.now());
    Array.from(snapshots[0].flatten(n => n).keys()).sort().should.eql([
      "new", "new2", "old", "old2"
    ]);

    r._publish(Date.now() + 10);
    Array.from(snapshots[1].flatten(n => n).keys()).sort().should.eql([
      "new", "old"
    ]);

    Promise.delay(25).then(() => {
      r.counter("new").increment(5);
      r.distribution("new2").add(1);
      r._publish(Date.now());
      Array.from(snapshots[2].flatten(n => n).keys()).sort().should.eql([
        "new", "new2"
      ]);
      done();
    });
  });

  it("revivifies counters that expired but have live references", done => {
    const snapshots = [];
    const r = new MetricsRegistry({ expire: 25 });
    r.addObserver(s => snapshots.push(s));

    const counter = r.counter("old");
    counter.reaped.should.eql(false);

    counter.increment(5);
    r._publish(Date.now());
    Array.from(snapshots[0].flatten(n => n)).sort().should.eql([
      [ "old", { type: "counter", value: 5 } ]
    ]);

    r._publish(Date.now() + 10);

    Promise.delay(25).then(() => {
      r._publish(Date.now());
      Array.from(snapshots[2].flatten(n => n)).sort().should.eql([]);

      counter.reaped.should.eql(true);
      (counter.forwarded == null).should.eql(true);
      counter.increment(3);
      counter.reaped.should.eql(true);
      counter.forwarded.reaped.should.eql(false);

      r._publish(Date.now() + 10);
      Array.from(snapshots[3].flatten(n => n)).sort().should.eql([
        [ "old", { type: "counter", value: 3 } ]
      ]);

      return Promise.delay(25);
    }).then(() => {
      r._publish(Date.now());
      Array.from(snapshots[4].flatten(n => n)).sort().should.eql([]);

      counter.reaped.should.eql(true);
      counter.forwarded.reaped.should.eql(true);
      counter.increment(9);
      counter.reaped.should.eql(true);
      counter.forwarded.reaped.should.eql(false);

      r._publish(Date.now() + 10);
      Array.from(snapshots[5].flatten(n => n)).sort().should.eql([
        [ "old", { type: "counter", value: 9 } ]
      ]);

      done();
    });
  });

  it("removes gauges", () => {
    const snapshots = [];
    const r = new MetricsRegistry({ expire: 25 });
    r.addObserver(s => snapshots.push(s));

    r.setGauge("aura", () => 23);
    r.withPrefix("owl").setGauge("spirit", () => 17);
    r._publish(Date.now());
    Array.from(snapshots[0].flatten(n => n).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    r._publish(Date.now());
    Array.from(snapshots[1].flatten(n => n).keys()).sort().should.eql([ "aura", "owl_spirit" ]);

    r.removeGauge("aura");
    r.withPrefix("owl").removeGauge("spirit");
    r._publish(Date.now());
    Array.from(snapshots[2].flatten(n => n).keys()).sort().should.eql([ ]);
  });
});
