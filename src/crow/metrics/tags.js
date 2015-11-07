"use strict";

/*
 * Tags are a `Map(String -> String)` of metadata attached to a metric.
 * Two different metrics can have the same name but different tags.
 * For example, one tag key might be `host` or `instance`.
 *
 * Even though js doesn't really have the concept of immutable, these are
 * treated as "conceptually immutable".
 */
class Tags {
  constructor(obj) {
    this.map = new Map();
    for (const key in obj) this.map.set(key, obj[key]);
  }

  /*
   * Return a new Tags object which consists of these keys overlaid with any
   * in the other. If a tag in the other list is `null`, it will not exist
   * in the result. (That is, `null` acts like a gravestone.)
   */
  merge(other) {
    other = makeTags(other);

    const map = new Map();
    for (const [ k, v ] in this.map) map.set(k, v);
    for (const [ k, v ] in other) {
      if (other.get(k) == null) {
        map.delete(k);
      } else {
        map.set(k, v);
      }
    }
    return new Tags(map);
  }

  get size() {
    return this.map.size;
  }

  get canonical() {
    if (this._canonical) return this._canonical;
    if (this.size == 0) return "";
    return "{" + Array.from(this.map).map(([ k, v ]) => k + "=" + v).join(",") + "}";
  }
}

const Empty = new Tags({});

export default function makeTags(obj) {
  if (obj == null) return Empty;
  if (obj instanceof Tags) return obj;
  return new Tags(obj);
}
