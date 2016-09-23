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
export class MetricName<T> {
  private _canonical: string;

  // internally, tags are a single array of [ key, value, key, value, ...] to save space.
  private constructor(
    public type: MetricType,
    public name: string,
    public tags: string[],
    public parent: MetricName<any> | null,
    public maker: ((name: MetricName<T>) => T) | null
  ) {
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
    if (this.tags.length == 0) return this.name;
    const map = new Map<string, string>();
    this.tagsToMap(map);
    return this.name + joiner(Array.from(map.entries()).map(([ k, v ]) => formatter(k, v)).sort());
  }

  private tagsToMap(map: Map<string, string>): void {
    if (this.parent) this.parent.tagsToMap(map);
    for (let i = 0; i < this.tags.length; i += 2) {
      map.set(this.tags[i], this.tags[i + 1]);
    }
  }

  // for use as string keys in the registry.
  get canonical(): string {
    return this._canonical;
  }

  private withExtraTags(tags: string[]): MetricName<T> {
    return new MetricName<T>(this.type, this.name, tags, this, this.maker);
  }

  private withReplacedTags(tags: string[]): MetricName<T> {
    return new MetricName<T>(this.type, this.name, tags, null, this.maker);
  }

  /*
   * Return a new MetricName which consists of these tags overlaid with any
   * tags passed in.
   */
  addTags(other: Tags): MetricName<T> {
    return this.withExtraTags(other instanceof Map ? mapToList(other) : objToList(other));
  }

  /*
   * Return a new MetricName with the given tag added.
   */
  addTag(key: string, value: string): MetricName<T> {
    return this.withExtraTags([ key, value ]);
  }

  /*
   * Return a new MetricName with the given tag(s) removed.
   */
  removeTags(...keys: string[]): MetricName<T> {
    const map = new Map<string, string>();
    this.tagsToMap(map);
    keys.forEach(key => map.delete(key));
    return this.withReplacedTags([].concat.apply([], Array.from(map.entries())));
  }

  withType<U>(type: MetricType): MetricName<U> {
    return new MetricName<U>(type, this.name, this.tags, this.parent, null);
  }

  static create<T>(
    type: MetricType,
    name: string,
    tags?: Tags | null,
    parent?: MetricName<any> | null,
    maker?: ((name: MetricName<T>) => T) | null
  ): MetricName<T> {
    if (tags == null) return new MetricName(type, name, [], parent || null, maker || null);
    const realTags = (tags instanceof Map) ? mapToList(tags) : objToList(tags);
    return new MetricName(type, name, realTags, parent || null, maker || null);
  }
}

export type Tags = Map<string, string> | { [key: string]: string };

const NoTags = new Map<string, string>();

function objToMap(obj: Object): Map<string, string> {
  return new Map(Object.keys(obj).map(k => [ k, obj[k].toString() ] as [ string, string ]));
}

function objToList(obj: Object): string[] {
  return [].concat.apply([], Object.keys(obj).map(k => [ k, obj[k].toString() ]));
}

function mapToList(map: Map<string, string>): string[] {
  return [].concat.apply([], Array.from(map.entries()));
}
