"use strict";

import { MetricsRegistry, viz } from "../../lib";

import "should";
import "source-map-support/register";


const FakeExpress = {
  handlers: {},
  Router: () => FakeExpress.router,
  static: () => null,
  router: {
    use: () => null,
    get: (path, callback) => FakeExpress.handlers[path] = callback
  }
};

function fakeResponse() {
  const buffer = [];

  return {
    type: () => null,
    send: (obj) => buffer.push(obj),
    getBuffer: () => buffer
  };
}

describe("viz", () => {
  it("reports current values", () => {
    const r = new MetricsRegistry();
    viz(FakeExpress, r);

    r.setGauge("speed", 45);
    r.counter("bugs").increment(23);
    r.distribution("tears").add(10);
    r._publish();

    const response = fakeResponse();
    FakeExpress.handlers["/current.json"](null, response);
    response.getBuffer().should.eql([
      {
        bugs: 23,
        speed: 45,
        "tears{p=0.5}": 10,
        "tears{p=0.99}": 10,
        "tears{p=0.9}": 10,
        "tears{p=count}": 1,
        "tears{p=sum}": 10
      }
    ]);
  });

  it("reports history", () => {
    const r = new MetricsRegistry();
    viz(FakeExpress, r);

    r.setGauge("speed", 45);
    r.counter("bugs").increment(23);
    r.distribution("tears").add(10);
    r._publish();
    r.counter("bugs").increment(5);
    r.distribution("tears").add(3);
    r._publish();

    const response = fakeResponse();
    FakeExpress.handlers["/history.json"](null, response);
    const buffer = response.getBuffer();
    buffer.length.should.eql(1);
    const history = buffer[0];
    Object.keys(history).sort().should.eql([
      "@timestamp", "bugs", "speed", "tears{p=0.5}", "tears{p=0.99}", "tears{p=0.9}", "tears{p=count}", "tears{p=sum}"
    ]);
    history.bugs.should.eql([ null, 5 ]);
    history.speed.should.eql([ 45, 45 ]);
    history["tears{p=count}"].should.eql([ 1, 1 ]);
    history["tears{p=0.5}"].should.eql([ 10, 3 ]);
  });
});
