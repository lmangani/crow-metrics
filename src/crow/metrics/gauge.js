"use strict";

export default class Gauge {
  constructor(name, tags, getter) {
    this.name = name;
    this.tags = tags;
    this.set(getter);
  }

  set(getter) {
    this.get = (typeof getter === "function") ? getter : (() => getter);
  }

  get value() {
    return this.get();
  }
}
