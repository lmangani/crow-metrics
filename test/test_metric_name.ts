import { MetricName, MetricType } from "../src";

import "should";
import "source-map-support/register";

describe("MetricName", () => {
  it("simple", () => {
    MetricName.create(MetricType.Counter, "count").canonical.should.eql("count");
  });

  it("sort keys for canonical format", () => {
    const name = MetricName.create(MetricType.Counter, "foo", { one: "1", two: "2", boa: "3" });
    name.canonical.should.eql("foo{boa=3,one=1,two=2}");
  });

  it("makes a copy of a passed-in map for immutability", () => {
    const map = new Map([ [ "one", "1" ] ]);
    const name = MetricName.create(MetricType.Counter, "foo", map);
    map.set("two", "2");
    name.canonical.should.eql("foo{one=1}");
  });

  it("merges two tags", () => {
    const name1 = MetricName.create(MetricType.Counter, "foo", { one: "1", three: "3" });
    name1.addTags({ one: "2", two: "2" }).canonical.should.eql("foo{one=2,three=3,two=2}");
  });

  it("adds and removes tags", () => {
    const name = MetricName.create(MetricType.Counter, "foo", { one: "1", two: "2", boa: "3" });
    name.removeTags("one", "boa").canonical.should.eql("foo{two=2}");
    name.addTag("four", "4").canonical.should.eql("foo{boa=3,four=4,one=1,two=2}");
  });
});
