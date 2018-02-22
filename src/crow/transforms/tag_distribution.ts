import { Distribution } from "../metrics/distribution";
import { MetricName, MetricType, Tags } from "../metric_name";
import { MetricsRegistry } from "../registry";
import { Snapshot } from "../snapshot";

/*
 * How to match a metric name and convert it into a distribution.
 */
export interface MetricMatcher {
  // match returns true if this metric should be converted to a distribution.
  match: string | RegExp | ((name: MetricName) => boolean);

  // which tags should be removed? (each unique tag combination is treated as a data point.)
  sortByTags: string[];

  // if present, override the metric name.
  name?: string;

  // if present, add this tag to the distribution name.
  addTags?: Tags;

  // if present, override the default percentiles list.
  percentiles?: number[];

  // if present, override the default error rank.
  error?: number;
}

class Matcher {
  constructor(
    public filter: (name: MetricName) => boolean,
    public getDistribution: (name: MetricName) => Distribution
  ) {
    // pass.
  }
}

/*
 * Filter some counters & gauges and convert them into distributions. Each
 * matching counter & gauge will be sorted by a selected set of tags, with
 * each distinct metric becoming a data point in the output metric. For
 * example, if the tag set is `state`, then these two metrics:
 *
 *     userCount{type=registered,state=CA} = 16
 *     userCount(type=registered,state=NV) = 9
 *
 * would become the single distribution `userCount{type=registered}`, with
 * two data points (9 and 16).
 *
 * This is a transform meant to be used in a `map` of snapshot events from
 * the `MetricsRegistry`:
 *
 *     registry.events.map(tagDistribution(registry, [ ... ])).subscribe(snapshot => ...);
 *
 */
export function tagDistribution(registry: MetricsRegistry, ...metricMatchers: MetricMatcher[]) {
  const newDistributions = new Map<string, Distribution>();

  const matchers = metricMatchers.map(m => {
    const filter = (m.match instanceof Function) ? m.match :
      ((m.match instanceof RegExp) ?
        (x: MetricName) => (m.match as RegExp).test(x.name) :
        (x: MetricName) => m.match == x.name
      );
    const getDistribution = <T>(x: MetricName) => {
      const tagMap = x.removeTags(...m.sortByTags).addTags(m.addTags || {}).tagMap;
      const name = registry.distribution(m.name || x.name, tagMap, m.percentiles, m.error);
      let d = newDistributions.get(name.canonical);
      if (d != null) return d;
      if (name.maker == null) throw new Error("assert");
      d = name.maker(name) as Distribution;
      newDistributions.set(name.canonical, d);
      return d;
    }
    return new Matcher(filter, getDistribution);
  });

  return (snapshot: Snapshot) => {
    const map = new Map<MetricName, number>();

    for (const [ metric, value ] of snapshot.map) {
      if (metric.type != MetricType.Distribution) {
        const matcher = matchers.filter(m => m.filter(metric))[0];
        if (matcher) {
          matcher.getDistribution(metric).add(value);
        } else {
          map.set(metric, value);
        }
      } else {
        map.set(metric, value);
      }
    }

    // add any new distributions we computed.
    for (const d of newDistributions.values()) d.save(map);

    return new Snapshot(snapshot.registry, snapshot.timestamp, map);
  };
}
