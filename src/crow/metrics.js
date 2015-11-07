
//
// import BiasedQuantileDistribution from "./bqdist";
//
//
//
//
//
// /*
//  * every metric has a name and tags.
//  */
//
// let MetricType = {
//   GAUGE: 0,
//   COUNTER: 1,
//   DISTRIBUTION: 2
// };
//
// function metricName(i) {
//   return Object.keys(MetricType).filter((name) => MetricType[name] == i)[0];
// }
//


//
// class Distribution {
//   constructor(registry, name, fullname, tags = {}, percentiles, error) {
//     this.registry = registry;
//     this.name = name;
//     this.fullname = fullname;
//     this.tags = tags;
//     this.percentiles = percentiles;
//     this.error = error;
//     this.type = MetricType.DISTRIBUTION;
//     this.distribution = new bqdist.BiasedQuantileDistribution(this.percentiles, this.error);
//   }
//
//   /*
//    * return a distribution with the same name, but different tags.
//    * you may "remove" tags by setting them to null.
//    * this call defers to the registry, so if a distribution with this tag
//    * combination already exists, that will be returned. otherwise, a new
//    * distribution is created.
//    */
//   withTags(tags) {
//     return this.registry.distribution(this.name, mergeTags(this.tags, tags), this.percentiles, this.error);
//   }
//
//   /*
//    * add one data point (or more, if an array) to the distribution.
//    */
//   add(data) {
//     if (Array.isArray(data)) {
//       data.forEach((x) => this.distribution.record(x));
//     } else {
//       this.distribution.record(data);
//     }
//   }
//
//   get() {
//     let snapshot = this.distribution.snapshot();
//     this.distribution.reset();
//     let rv = {};
//     if (snapshot.sampleCount == 0) return rv;
//     this.percentiles.forEach((p) => {
//       rv[this.registry._fullname(this.name, this.tags, { quantile: p })] = snapshot.getPercentile(p);
//     });
//     rv[this.registry._fullname(this.name + "_count", this.tags)] = snapshot.sampleCount;
//     rv[this.registry._fullname(this.name + "_sum", this.tags)] = snapshot.sampleSum;
//     return rv;
//   }
//
//   /*
//    * time a function call and record it (in milliseconds).
//    * if the function returns a promise, the recorded time will cover the time
//    * until the promise succeeds.
//    * exceptions (and rejected promises) are not recorded.
//    */
//   time(f) {
//     let startTime = Date.now();
//     let rv = f();
//     // you aren't going to believe this. the type of null is... "object". :(
//     if (rv != null && typeof rv === "object" && typeof rv.then === "function") {
//       return rv.then((rv2) => {
//         this.add(Date.now() - startTime);
//         return rv2;
//       })
//     } else {
//       this.add(Date.now() - startTime);
//       return rv;
//     }
//   }
// }
//
//
//
// exports.Counter = Counter;
// exports.Distribution = Distribution;
// exports.Gauge = Gauge;
// exports.metricName = metricName;
// exports.MetricType = MetricType;
