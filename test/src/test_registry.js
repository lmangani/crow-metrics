var registry = require("../../lib/crow/registry");
var should = require("should");
var util = require("util");

require("source-map-support").install();

describe("Registry", () => {
  it("remembers counters", () => {
    let r = new registry.Registry();
    let c = r.counter("buckets");
    c.get().should.eql(0);
    c.increment(5);
    c.get().should.eql(5);
    c.increment();
    c.get().should.eql(6);
    r.counter("buckets").get().should.eql(6);
  });

  it("remembers gauges", () => {
    let state = 0;
    let r = new registry.Registry();
    r.setGauge("speed", 100);
    r.setGauge("computed", { animal: "cat" }, () => {
      state += 1;
      return state;
    });
    r.gauge("speed").get().should.eql(100);
    r.gauge("computed", { animal: "cat" }).get().should.eql(1);
    r.gauge("computed", { animal: "cat" }).get().should.eql(2);
  });

  it("remembers distributions", () => {
    let r = new registry.Registry();
    let d = r.distribution("stars", {}, [ 0.5, 0.9 ]);
    d.add([ 10, 20, 30 ]);
    d.get().should.eql({
      "stars{quantile=\"0.5\"}": 20,
      "stars{quantile=\"0.9\"}": 30,
      "stars_count": 3
    });

    d = r.distribution("stars", { galaxy: "1a" }, [ 0.5, 0.9 ]);
    d.add([ 100, 300, 500 ]);
    r.distribution("stars", { galaxy: "1a" }).get().should.eql({
      "stars{galaxy=\"1a\",quantile=\"0.5\"}": 300,
      "stars{galaxy=\"1a\",quantile=\"0.9\"}": 500,
      "stars_count{galaxy=\"1a\"}": 3
    });
  });

  it("tracks tags", () => {
    let r = new registry.Registry();
    let c = r.counter("buckets", { city: "San Jose" });
    c.increment(3);
    c.withTags({ city: null, contents: "fire" }).increment(10);
    r.counter("buckets", { contents: "fire" }).get().should.eql(10);
  });

  it("makes a snapshot", () => {
    let r = new registry.Registry();
    r.counter("buckets", { city: "San Jose" }).increment(10);
    r.counter("cats").increment(900);
    r.counter("buckets", { contents: "fire" }).increment(3);
    r.setGauge("speed", 150);
    r.distribution("stars").withTags({ galaxy: "1a" }).add([ 90, 100, 110 ]);
    r.snapshot().should.eql({
      "cats": 900,
      "buckets{city=\"San Jose\"}": 10,
      "buckets{contents=\"fire\"}": 3,
      "speed": 150,
      "stars{galaxy=\"1a\",quantile=\"0.5\"}": 100,
      "stars{galaxy=\"1a\",quantile=\"0.9\"}": 110,
      "stars{galaxy=\"1a\",quantile=\"0.99\"}": 110,
      "stars_count{galaxy=\"1a\"}": 3
    });
  });

  it("publishes to observers", (done) => {
    let captured = [];
    let r = new registry.Registry({ period: 10 });
    r.addObserver((timestamp, snapshot) => captured.push([ timestamp, snapshot ]));
    r.counter("buckets").increment(5);
    setTimeout(() => {
      r.counter("buckets").increment(3);
      setTimeout(() => {
        captured.length.should.eql(2);
        captured[0][1].should.eql({ buckets: 5 });
        captured[1][1].should.eql({ buckets: 8 });
        (captured[1][0] - captured[0][0]).should.be.greaterThan(9);
        done();
      }, 11);
    }, 11);
  });

  it("refuses to let two metrics have the same name", () => {
    let r = new registry.Registry();
    r.setGauge("buckets", 10);
    (() => r.counter("buckets")).should.throw("buckets is already a gauge");
    (() => r.distribution("buckets")).should.throw("buckets is already a gauge");
  })
});
