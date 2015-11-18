# crow-metrics manual

This manual is meant to cover every aspect of a fairly tiny library. The sections are all independent, so feel free to jump right to the section that sounds most relevant to your interests.

- [API](#api)
  - [MetricsRegistry](#metricsregistry)
  - [Snapshot](#snapshot)
- [Metrics objects](#metrics-objects)
  - [Gauge](#gauge)
  - [Counter](#counter)
  - [Distribution](#distribution)
- [Observers](#observers)
  - [DeltaObserver](#deltaobserver)
  - [RingBufferObserver](#ringbufferobserver)
- [Built-in plugins](#built-in-plugins)
  - [InfluxDB](#influxdb)
  - [Prometheus](#prometheus)
  - [Viz](#viz)


## API

The top-level API consists of a [MetricsRegistry](#metricsregistry) class for recording metrics, and some classes and functions for reporting those metrics to other services at a regular interval.


### MetricsRegistry

The registry is the central coordinator for metrics collection and dispersal. It tracks metrics in a single namespace, and periodically takes a snapshot and sends it to any observers. (A typical observer might push the metrics into graphite, riemann, influxdb, or prometheus.)

  - `new MetricsRegistry(options = {})`

Options:

  - `period` (in milliseconds, default=60_000) - How often should snapshots be sent to observers? One minute is a good starting point, though some people prefer 30 seconds or even less. Crow will recognize a round number and arrange the timer to go off at "round" times, so for example, a one-minute period will report at the top of each minute (11:23:00, 11:24:00, ...).

  - `log` - If you want to see debug logs, provide a bunyan-compatible logger here. Otherwise, nothing will be logged.

  - `percentiles` (array of numbers) - Which percentiles do you want to report for distributions (like timings)? The values must be real numbers between 0 and 1. The default is `[ 0.5, 0.9, 0.99 ]`, or the 50th (median), 90th, and 99th percentiles. This option is used as a default, and may be overridden by individual metrics. For more about how the distributions are calculated, see [distributions](#distributions) below.

  - `error` - What rank error is acceptible when approximating percentiles? The default is `0.01` (1%), which is usually fine.

  - `tags` (object of string keys & string values) - What tags should be applied to every metric? This is used to "pre-seed" a set of tags that refer to this service instance as a whole, like `instanceId` or `hostname`. They can be used to distinguish metrics reported from multiple nodes. The default is to add no extra tags.

  - `separator` (string) - When using segmented metric names (via `withPrefix`), what should it use to separate the segments in a full name? The default is `"_"`.

  - `expire` (in milliseconds) - How long should a metric go without an update, before Crow stops reporting on it? The default is "forever": never expire old metrics. This only applies to counters and distributions, and only matters if you use external data (like client IP or username) in tags -- which you should probably avoid. But if you do that, you could end up with thousands of stale metrics that refer to users who logged out hours ago, so you should use this option to let Crow discard them.

Methods:

  - `counter(name, tags = {})`

    Return a new or existing counter with the given name and tags. Counter objects may be cached, or you may call `counter` to look it up each time. See [Metrics objects](#metrics-objects) below for the counter object API.

  - `setGauge(name, tags = {}, getter)`

    Build a new gauge with the given name, tags, and "getter". The "getter" is usually a function that will be called when crow wants to know the current value. If the value changes rarely, `getter` may be a number instead, and you can call `setGauge` with a new number each time the value changes.

  - `gauge(name, tags = {})`

    Return the gauge with the given name and tags. If no such gauge is found, it throws an exception. See [Metrics objects](#metrics-objects) below for the gauge object API.

  - `distribution(name, tags = {}, percentiles = this.percentiles, error = this.error)`

    Return a new or existing distribution with the given name and tags. If `percentiles` or `error` is non-null, they will override the registry defaults. See [Metrics objects](#metrics-objects) below for the distribution object API.

  - `withPrefix(prefix)`

    Return a registry-like object which prefixes all metric names with the given prefix plus the separator (usually "\_" but set in a `MetricsRegistry` constructor option). The returned object is really a "view" of this registry with each metric name prefixed. For example, the following two lines create or find the same counter:

    ```javascript
    const registry = new crow.MetricsRegistry({ separator: "." });

    registry.counter("cats.meals")
    registry.withPrefix("cats").counter("meals")
    ```

    You can use this to namespace metrics in sub-modules.

  - `addObserver(observer)`

    Add an observer. The registry maintains an array of observer objects, and sends a snapshot of the current state to each observer at each interval specified by the period of the registry. For example, if the registry's period is 60000, or 60 seconds, then each observer is invoked once a minute.

    The observers are all expected to be functions that accept one parameter, a snapshot (described below):

      - `function observer(snapshot)`

    A typical observer collects the metrics snapshot and reports it to another service, either by pull (exposing the metrics on a web port) or push (sending them immediately to another server). [Viz](#viz) is an observer that collects an hour of metrics and makes a simple web page summarizing the data.

    Some built-in observers are described in [Observers](#observers).


### Snapshot

Each observer receives a `Snapshot` object at a regular interval, which contains the set of metrics being collected and their current values. It's only interesting if you are publishing metrics in a custom way. If you plan to use one of the plugins to publish to InfluxDB, Prometheus, or so on, then you can skip this section.

A snapshot object has these fields:

  - `registry` - a reference back to the [MetricsRegistry](#metricsregistry) that created it
  - `timestamp` - the current epoch time in milliseconds
  - `map` - an ES6 `Map` of metric objects to their value at that timestamp

The metrics objects are described below. Each has at least a name, a `Tags` object, and a type. The value may be a number (for gauges and counters) or a `Map` of string names to numbers for a distribution: one for each requested percentile, plus a count and a sum.

The `Tags` object wraps a `Map` of string tag names and values, and provides methods for merging tags and generating a string of their contents. `Snapshot` objects also provide methods to help generate string keys for each metric name and tags. Check out the source for detailed documentation about how to use these objects directly.

The default `flatten()` method will generate a flat `Map` of string keys to numbers, encoding tags in OpenTSDB format, and attaching distribution maps using a "p" tag:

```javascript
{
  "bugs": 13,
  "bugs{module=sickbay}": 8,
  "request_time_msec{p=0.5}": 9,
  "request_time_msec{p=0.99}": 32,
  "request_time_msec{p=count}": 12,
  "request_time_msec{p=sum}": 549,
  "heap_used": 14937602
}
```


## Metrics objects

All metrics objects created by a `MetricsRegistry` have at least these fields:

  - `name` - as given when the metric was created
  - `type` - the lowercase version of the class name (`gauge`, `counter`, or `distribution`)
  - `tags` - a `Tags` object wrapping a `Map` of string tag names and string values
  - `value` - the current value, either as a number, or (for distributions) a `Map` of string keys to numbers

Other methods vary based on the type:

### Gauge

  - `set(getter)`

    Replace the gauge's getter function.

### Counter

  - `increment(count = 1, tags = {})`

    Increment the counter. If `tags` is given, it's a shortcut for calling `withTags()` first.

  - `withTags(tags)`

    Return a new or existing counter with the same name as this one, but different tags. This is useful if you have a cached counter object for a name, but sometimes want to increment a counter with a different tag (like an exception name).

### Distribution

Distributions are collected and sampled using a method described in ["Effective Computation of Biased Quantiles over Data Streams"](http://www.cs.rutgers.edu/~muthu/bquant.pdf). It attempts to keep only the samples closest to the desired percentiles, so for example, if you only want the median, it keeps most of the samples that fall in the middle of the range, but discards samples on either end. To do this, the algorithm needs to know the desired percentiles, and the allowable error.

For most uses, this is overkill. If you specify an allowable rank error of 1%, and have fewer than 100 samples each minute, it's unlikely to discard _any_ of the samples, and will compute the percentiles directly. But if you have thousands of samples, it will discard most of them as it narrows in on the likely range of each percentile.

The upshot is that for small servers, it's equivalent to keeping all the samples and computing the percentiles exactly on each interval. For large servers, it processes batches of samples at a time (varying based on the desired error; 50 at a time for 1%) and computes a close estimate, using a small fraction of the samples.

  - `value`

    Compute percentiles based on the samples collected, and reset the collection. This is a destructive operation, so normally it's only used by `MetricsRegistry` to generate the periodic snapshots.

    The returned `Map` will contain a key for each percentile requested, and two additional metrics:
      - a `count` metric to report the number of samples in this time period
      - a `sum` metric to report the sum of all samples in this time period

    Percentiles are represented by their numeric value ("0.5").

    For example, when computing the 50th and 95th percentiles of a metric called `request_time_msec`, `value` will return a `Map` like this:

    ```javascript
    {
      "0.5": 23,
      "0.95": 81,
      "count": 104,
      "sum": 4188
    }
    ```

  - `add(data)`

    Add a sample to the distribution. If `data` is an array, all the data points in the array are added.

  - `time(f)`

    Call `f` as a function, recording the time it takes to complete, in milliseconds. If `f` returns a promise (an object with a field named `then` which is a function), it will record the time it takes the promise to complete. Returns whatever `f` returns, so you can call it inline like:

    ```javascript
    const dbTimer = registry.distribution("db_select_msec");

    dbTimer.time(db.select("...")).then(function (rows) {
      // ...
    });
    ```

  - `withTags(tags)`

    Return a new or existing distribution with the same name as this one, but different tags.


## Observers

Observers receive metrics snapshots and either transform them, or forward them to a reporting service (or both). A couple of transforms are included in the library because they're commonly used by reporter plug-ins.


### DeltaObserver

Some metrics databases (like prometheus) can track counters and gauges separately, and want to know the type of each metric. Others (like graphite and influxdb) treat all values as gauges, so counters must be turned into instantaneous values before being reported. `DeltaObserver` does that.

Each time a snapshot is posted, it compares counters to their values at the previous snapshot, and reports the difference. This turns them into a "value per time unit" metric. For example, a "bugs" counter, reported once a minute, would become a "bugs per minute" gauge.

None of the metric names are altered. The new all-gauge snapshot is sent to the any attached observers.

  - `new DeltaObserver(options = {})`

Options:

  - `rank` (array) - described below

Fields and methods:

  - `addObserver(observer)` - just like on `MetricsRegistry`
  - `observer` - function that can be passed as an observer to `MetricsRegistry`

Typical usage:

```javascript
const registry = new MetricsRegistry(...);
const d = new DeltaObserver(...);
registry.addObserver(d);
d.addObserver(...);
```

In the process of converting counters to gauges, a DeltaObserver can also collate counters into a distribution. For example, if you're couting errors per session, you might increment a counter like this:

```javascript
registry.counter("errors", { session: this.sessionId });
```

If you then "rank" the errors by session, you can get a histogram and report the median, 90th percentile, and so on. Since a distribution also includes the sum, it will also contain total errors over the same period. To convert tagged metrics into a distribution, you must supply the distinguishing tags, and optionally a new name for the metric. The tagged metrics that are ranked will be omitted from the resulting snapshot.

Each "rank" item is an object with these fields:

  - `match` (string or regex) - The ranking will only apply to metrics with a name that matches.
  - `tags` (array of string) - These tags will be used to distinguish different samples in the distribution. The distribution will contain any tags from the original counter (or gauge), with these removed.
  - `name` (optional string) - If this field is present, the distribution will use this name. Otherwise it will preserve the name of the original counter or gauge.

For example, this DeltaObserver will rank errors by sessionId:

```javascript
const d = new DeltaObserver({
  rank: [ { match: "errors", tags: [ "session" ], name: "errors_per_session" } ]
});

registry.counter("errors", { session: this.sessionId, code: 10 });
// will be reported as a sample in a new metric "errors_per_session{code=10}"
```


### RingBufferObserver

A RingBufferObserver saves snapshots in a ring buffer for a specified amount of time (one hour, by default). This is used to power [viz](#viz).

  - `new RingBufferObserver(options = {})`

Options:

  - `span` (in milliseconds) - The ring buffer will be large enough to hold snapshots from this time period. As new snapshots arrive, ones older than this span will be dropped. The default is one hour (3600 * 1000).

Fields and methods:

  - `observer` - function that can be passed as an observer to `MetricsRegistry`

  - `getLatest()` - Return the most recent Snapshot object. This may return `null` if no snapshots have arrived yet.

  - `get()` - Return an array of Snapshot objects, from oldest to newest. The array may be empty if no snapshots have arrived yet.

  - `toJson()` - Return a JSON-friendly representation of the ring buffer.

The JSON-friendly representation is an object with metric names for keys (using the default OpenTSDB-style flattened names) and arrays of numbers for values. Distributions are reported as multiple keys, flattened as described in [Snapshot](#snapshot). The numbers are in order from oldest to newest. If a metric wasn't reported for a particular time, the value will be null. An extra field named `@timestamp` contains an array of the corresponding timestamps for the values.


## Built-in plugins

### InfluxDB

[InfluxDB](https://influxdb.com/), like Graphite, expects to receive a `POST` containing a summary of metrics from each server at a regular interval.

The influx observer receives each snapshot as it's computed, formats it into a document in InfluxDB format, and posts it to the configured host. You must provide the `request` module, or a module with a similar interface.

```javascript
const crow = require("crow-metrics");
const request = require("request");

const registry = new crow.MetricsRegistry();
crow.exportInflux(registry, request, { hostname: "my.influx.server:8086", database: "mydb" });
```

  - `exportInflux(registry, request, options = {})`

Options:

  - `hostname` - influxdb host (default: "influxdb.local:8086")
  - `database` - influxdb database name (default: "test")
  - `url` - use a custom url, instead of `http://(hostname)/write?db=(database)` (overrides `hostname` and `database` options)
  - `timeout` (in milliseconds) - how long to wait before giving up (default is 5000, or five seconds)
  - `log` - bunyan-style log for reporting errors
  - `rank` - passed to [DeltaObserver](#deltaobserver)


### Prometheus

[Prometheus](http://prometheus.io/) polls servers at a regular interval, expecting periodic metric summaries to be available via HTTP.

The prometheus observer attaches to any existing [express](http://expressjs.com/) app, and provides the prometheus text format:

```javascript
const crow = require("crow-metrics");
const express = require("express");

const registry = new crow.MetricsRegistry();
const app = express();
app.use("/metrics", crow.prometheusExporter(express, registry));
app.listen(9090);
```

The above code creates an HTTP server that provides a metrics summary to prometheus on `http://(localhost):9090/metrics`. The summary is updated periodically as configured by the [MetricsRegistry](#metricsregistry) interval.

Counters and gauges are reported as-is, and distribution quantiles are reported as "summary" quantiles, in the format prometheus expects.

  - `new PrometheusObserver()`

    Create a new observer that can be added to a [MetricsRegistry](#metricsregistry), like `registry.addObserver(prometheusObserver.observer);`.

  - `prometheusExporter(express, registry)`

    Make a new `PrometheusObserver`, attach it to the given registry, and return an express handler that will respond to requests with a prometheus-style document of metrics.


### Viz

For local debugging, sanity checking -- or simply because it's pretty -- you may want to provide a web display of metrics for your server.

Viz attaches a [RingBufferObserver](#ringbufferobserver) to your registry, which collects metrics over a rolling window (one hour, by default), and graphs this data with [peity](http://benpickles.github.io/peity/).

<img src="https://raw.githubusercontent.com/robey/node-crow/master/docs/crow-screenshot.png">

There are two ways to construct the service:

  - `viz(express, registry, span = 60 * 60 * 1000)`

    Create an express handler that will respond to a path with the viz interface. This is useful if your server is already using express for other requests.

      - `express` - the express module or a compatible one
      - `registry` - a crow [MetricsRegistry](#metricsregistry)
      - `span` (in milliseconds) - total span to display in the graphs (default: 1 hour)

    For example:

    ```javascript
    var app = express();
    app.use("/admin/viz", crow.viz(express, registry));
    ```

  - `startVizServer(express, registry, port = 8080, span = 60 * 60 * 1000)`

    Start up the viz site on a devoted port with a new instance of the express (or compatible) server.

    For example:

    ```javascript
    var crow = require("crow-metrics");
    var express = require("express");

    var metrics = new crow.MetricsRegistry();
    crow.startVizServer(express, metrics, 9090);
    ```

    This will create a page at `http://localhost:9090/`.
