"use strict";

import makeTags from "./tags";

export default class Counter {
  constructor(registry, name, tags = makeTags()) {
    this.registry = registry;
    this.name = name;
    this.tags = tags;
    this.value = 0;
    this.lastUpdated = 0;
  }

  /*
   * return a counter with the same name, but different tags.
   * you may "remove" tags by setting them to null.
   * this call defers to the registry, so if a counter with this tag
   * combination already exists, that will be returned. otherwise, a new
   * counter is created.
   */
  withTags(tags) {
    return this.registry.counter(this.name, this.tags.merge(tags));
  }

  increment(count = 1, tags = null) {
    if (typeof count === "object") {
      // increment(tags)
      tags = count;
      count = 1;
    }

    if (tags) {
      this.withTags(tags).increment(count);
    } else {
      this.lastUpdated = Date.now();
      this.value += count;
    }
  }
}
