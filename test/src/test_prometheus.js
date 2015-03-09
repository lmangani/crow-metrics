"use strict";

let crow = require("../../lib/crow");
let should = require("should");
let util = require("util");

require("source-map-support").install();

describe("PrometheusObserver", () => {
  it("makes empty file", () => {
    let p = new crow.PrometheusObserver(new crow.Registry());
    p.generate().should.eql("# generated by crow\n");
  });

  it("reports counters & gauges", () => {
    let r = new crow.Registry();
    let p = new crow.PrometheusObserver();
    p.register(r);
    p.generate().should.eql("# generated by crow\n");
    r.counter("trucks").increment(10);
    r.setGauge("temperature", 21);
    r._publish();

    p.generate().split("\n").should.eql([
      "# generated by crow",
      "# TYPE trucks counter",
      "# TYPE temperature gauge",
      `trucks 10 ${p.lastTimestamp}`,
      `temperature 21 ${p.lastTimestamp}`,
      ""
    ]);
  });

  it("reports distributions", () => {
    let r = new crow.Registry();
    let p = new crow.PrometheusObserver();
    p.register(r);
    p.generate().should.eql("# generated by crow\n");
    r.distribution("coins_building_4").add([ 10, 11, 12 ]);
    r._publish();

    p.generate().split("\n").should.eql([
      "# generated by crow",
      "# TYPE coins_building_4 summary",
      `coins_building_4{quantile="0.5"} 11 ${p.lastTimestamp}`,
      `coins_building_4{quantile="0.9"} 12 ${p.lastTimestamp}`,
      `coins_building_4{quantile="0.99"} 12 ${p.lastTimestamp}`,
      `coins_building_4_count 3 ${p.lastTimestamp}`,
      ""
    ]);
  });

  it("reports with tags", () => {
    let r = new crow.Registry();
    let p = new crow.PrometheusObserver();
    p.register(r);
    p.generate().should.eql("# generated by crow\n");
    r.counter("trucks", { state: "TN" }).increment(10);
    r.counter("trucks", { state: "SC" }).increment(4);
    r._publish();

    p.generate().split("\n").should.eql([
      "# generated by crow",
      "# TYPE trucks counter",
      `trucks{state="TN"} 10 ${p.lastTimestamp}`,
      `trucks{state="SC"} 4 ${p.lastTimestamp}`,
      ""
    ]);
  });
});
