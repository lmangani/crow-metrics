// different metric types have different implementations:
export enum MetricType {
  Counter,
  Gauge,
  Distribution
}

/*
 * A metric name has a string name like "clientCount", and an optional list
 * of tags, each of which has a string name and string value (for example,
 * key "protocolVersion", value "2"). Tags allow the same metric to be
 * measured along several different dimensions and collated later.
 *
 * Internally, it's represented as a string and a `Map<string, string>`,
 * with a canonical string form that looks like `name{key=val,key=val}`,
 * with the keys in sorted (deterministic) order.
 *
 * This class should be considered immutable. Modifications always return a
 * new object.
 */
export class MetricName {
  private _canonical: string;

  private constructor(public type: MetricType, public name: string, public tags: Map<string, string>) {
    this._canonical = this.format();
  }

  /*
   * Format into a string. The formatter converts each tag's key/value pair
   * into a string, and the joiner adds any separators or surrounders. The
   * default formatters create the "canonical" version, using `=` to for tags
   * and surrounding them with `{...}`.
   */
  format(
    formatter: ((key: string, value: string) => string) = (k, v) => k + "=" + v,
    joiner: ((list: string[]) => string) = list => "{" + list.join(",") + "}"
  ): string {
    if (this.tags.size == 0) return this.name;
    return this.name + joiner(Array.from(this.tags).map(([ k, v ]) => formatter(k, v)).sort());
  }

  // for use as string keys in the registry.
  get canonical(): string {
    return this._canonical;
  }

  /*
   * Return a new MetricName which consists of these tags overlaid with any
   * tags passed in.
   */
  addTags(other: Tags): MetricName {
    const newTags = new Map(this.tags[Symbol.iterator]());
    for (const [ k, v ] of (other instanceof Map) ? other : objToMap(other)) newTags.set(k, v);
    return new MetricName(this.type, this.name, newTags);
  }

  /*
   * Return a new MetricName with the given tag added.
   */
  addTag(key: string, value: string): MetricName {
    const newTags = new Map(this.tags[Symbol.iterator]());
    newTags.set(key, value);
    return new MetricName(this.type, this.name, newTags);
  }

  /*
   * Return a new MetricName with the given tag(s) removed.
   */
  removeTags(...keys: string[]): MetricName {
    const newTags = new Map(this.tags[Symbol.iterator]());
    keys.forEach(key => newTags.delete(key));
    return new MetricName(this.type, this.name, newTags);
  }

  static create(type: MetricType, name: string, tags?: Tags): MetricName {
    if (tags == null) return new MetricName(type, name, NoTags);
    if (tags instanceof Map) {
      // es6 has a crazy way to clone a map!
      return new MetricName(type, name, new Map(tags[Symbol.iterator]()));
    } else {
      return new MetricName(type, name, objToMap(tags));
    }
  }
}

export type Tags = Map<string, string> | { [key: string]: string };

const NoTags = new Map<string, string>();

function objToMap(obj: Object): Map<string, string> {
  return new Map(Object.keys(obj).map(k => [ k, obj[k].toString() ] as [ string, string ]));
}
