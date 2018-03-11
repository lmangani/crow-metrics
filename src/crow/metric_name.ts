// different metric types have different implementations:
export enum MetricType {
  Counter,
  Gauge,
  Distribution
}

export type Tags = Map<string, string> | { [key: string]: string };

export const NoTags = new Map<string, string>();

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
 *
 * We assume metric names are created at startup time (for the server or for
 * a session), so we do as much work as possible in the constructor.
 */
export abstract class MetricName {
  canonical: string;

  constructor(
    public type: MetricType,
    public name: string,
    public tags: Map<string, string>,
  ) {
    this.canonical = this.format();
  }

  /*
   * Format into a string. The formatter converts each tag's key/value pair
   * into a string, and the joiner adds any separators or surrounders. The
   * default formatters create the "canonical" version, using `=` for tags
   * and surrounding them with `{...}`.
   */
  format(
    formatter: ((key: string, value: string) => string) = (k, v) => `${k}=${v}`,
    joiner: ((list: string[]) => string) = list => "{" + list.join(",") + "}"
  ): string {
    if (this.tags.size == 0) return this.name;
    const keys = [...this.tags.keys()].sort();
    return this.name + joiner(keys.map(k => formatter(k, this.tags.get(k) || "")));
  }
}

function tagsToMap(baseTags: Tags, tags: Tags = NoTags): Map<string, string> {
  function toEntries(t: Tags): Iterable<[ string, string ]> {
    return (t instanceof Map) ? t.entries() : Object.keys(t).map(k => [ k, t[k].toString() ] as [ string, string ]);
  }
  return new Map([...toEntries(baseTags), ...toEntries(tags)]);
}


export class Counter extends MetricName {
  constructor(name: string, baseTags: Tags, tags: Tags) {
    super(MetricType.Counter, name, tagsToMap(baseTags, tags));
  }
}

export class Gauge extends MetricName {
  constructor(name: string, baseTags: Tags, tags: Tags) {
    super(MetricType.Gauge, name, tagsToMap(baseTags, tags));
  }
}

export class Distribution extends MetricName {
  percentileGauges: Gauge[];
  countGauge: Gauge;
  sumGauge: Gauge;

  constructor(
    name: string,
    baseTags: Tags,
    tags: Tags,
    public percentiles: number[],
    public error: number
  ) {
    super(MetricType.Distribution, name, tagsToMap(baseTags, tags));
    this.percentileGauges = percentiles.map(p => new Gauge(this.name, this.tags, { p: p.toString() }));
    this.countGauge = new Gauge(this.name, this.tags, { p: "count" });
    this.sumGauge = new Gauge(this.name, this.tags, { p: "sum" });
  }
}
