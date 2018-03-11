import { Counter, Distribution, Gauge, MetricName, MetricType, NoTags } from "..";

import "should";
import "source-map-support/register";

describe("MetricName", () => {
  it("simple", () => {
    new Counter("count", NoTags, NoTags).canonical.should.eql("count");
    new Counter("count", NoTags, NoTags).type.should.eql(MetricType.Counter);
    new Distribution("timings", NoTags, NoTags, [], 0.1).canonical.should.eql("timings");
    new Distribution("timings", NoTags, NoTags, [], 0.1).type.should.eql(MetricType.Distribution);
    new Gauge("speed", NoTags, NoTags).canonical.should.eql("speed");
    new Gauge("speed", NoTags, NoTags).type.should.eql(MetricType.Gauge);
  });

  it("sort keys for canonical format", () => {
    const c = new Counter("foo", {}, { one: "1", two: "2", boa: "3" });
    c.canonical.should.eql("foo{boa=3,one=1,two=2}");
  });

  it("makes a copy of a passed-in map for immutability", () => {
    const map = new Map([ [ "one", "1" ] ]);
    const c = new Counter("foo", {}, map);
    map.set("two", "2");
    c.canonical.should.eql("foo{one=1}");
  });

  it("merges two tags", () => {
    const c = new Counter("foo", { one: "1", three: "3" }, { one: "2", two: "2" });
    c.canonical.should.eql("foo{one=2,three=3,two=2}");
  });
});
