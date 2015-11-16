# crow-metrics

<img src="docs/crow-small.png" align="right">

Crow is a library for collecting metrics about your server, similar to Twitter's Ostrich or Netflix's Servo.(\*) It helps you track things like:

  - How many requests am I handling per second?
  - How many requests am I handling concurrently?
  - What is the 90th percentile of latency in my database queries?

On a period of your choosing (for example, minutely) these metrics are summarized. You can then publish them to a graphing or monitoring system like Riemann, InfluxDB, Graphite, or Prometheus.

The goal of crow is to make it *dead simple* to collect and report these metrics, and to motivate you to add them everywhere!

(\*) Servo? Crow? _Get it?_ Ha ha ha.

- [Example](#example)
- [How does it work?](#how-does-it-work)
- [Documentation](docs/manual.md)


## Example

Here's a quick example of a web service that counts requests and response times, and publishes them in a format [prometheus](http://prometheus.io/) can poll:

```javascript
var crow = require("crow-metrics");
var express = require("express");

var webService = express();

// one registry to rule them all, publishing once a minute.
var metrics = new crow.MetricsRegistry({ period: 60000 });

// publish metrics to /metrics, formatted for prometheus.
webService.use("/metrics", crow.prometheusExporter(express, metrics));

// track heap-used as a gauge.
// the function will be called on-demand, once a minute.
metrics.setGauge("heap_used", function () { return process.memoryUsage().heapUsed; });

// my website.
webService.get("/", function (request, response) {
  // count incoming requests:
  metrics.counter("request_count").increment();

  // time how long it takes to respond:
  metrics.distribution("request_time_msec").time(function () {
    response.send("Hello!\n");
  });
});
```


## More complex example

FIXME
- use influxdb
- use a counter-as-rank
- use a withPrefix


## How does it work?

Metrics consist of:

  - **counters**: numbers that increase only (never decrease), like the number of requests handled since the server started.
  - **gauges**: dials that measure a changing state, like the number of currently open connections, or the amount of memory being used.
  - **distributions**: samples that are interesting for their histogram, like timings (95th percentile of database reads, for example).

Metrics are collected in a `MetricsRegistry` (usually you create only one). On a configurable period, these metrics are summarized and sent to observers. The observers can push the summary to a push-based service like Graphite, or post the results to a web service for a poll-based service like Prometheus.

Each metric has a name, which is a string. Crow doesn't care what's in the string, but if you're sending metrics to a service, most of them have a naming convention. In general, you should use a name that could be an identifier (starts with a letter, contains only letters, digits, and underscore). Some metrics services use dot to build folder-like namespaces. Typical metric names are:

  - `requests_received`
  - `mysql_select_count`
  - `users_query_msec`

The last one is an example of a timing. As a convention, timings should include the time unit as the last segment of their name.

Each metric may also have a set of "tags" attached. A tag is a name/value pair, both strings, that identifies some variant of the metric. For example, a request handler may use a different tag for successful operations and exceptions. When generating string forms of metrics, the tags are appended in alphabetical order, separated by commas, surrounded by curly braces. (This is a standard form used by most of the open-source metrics services.)

  - `requests_handled{success=true}`
  - `requests_handled{exception=IOError}`
  - `requests_handled{exception=AccessDenied}`

Tags are used by metrics services to split out interesting details while allowing the general case (`requests_handled` above) to be summarized.








### Snapshot

Each observer receives a `Snapshot` object at a regular interval, which contains the set of metrics being collected and their current values. It's only interesting if you are publishing metrics in a custom way. If you plan to use one of the plugins to publish to InfluxDB, Prometheus, or so on, then you can skip this section.

A snapshot object has these fields:

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
  - `value`: - the current value, either as a number, or (for distributions) a `Map` of string keys to numbers

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
    var dbTimer = registry.distribution("db_select_msec");

    dbTimer.time(db.select("...")).then(function (rows) {
      // ...
    });
    ```

  - `withTags(tags)`

    Return a new or existing distribution with the same name as this one, but different tags.


## How distributions work

This section is for people curious about how distribution percentiles are calculated.

Distributions are collected and sampled using a method described in ["Effective Computation of Biased Quantiles over Data Streams"](http://www.cs.rutgers.edu/~muthu/bquant.pdf). It attempts to keep only the samples closest to the desired percentiles, so for example, if you only want the median, it keeps most of the samples that fall in the middle of the range, but discards samples on either end. To do this, the algorithm needs to know the desired percentiles, and the allowable error.

For most uses, this is overkill. If you specify an allowable rank error of 1%, and have fewer than 100 samples each minute, it's unlikely to discard _any_ of the samples, and will compute the percentiles directly. But if you have thousands of samples, it will discard most of them as it narrows in on the likely range of each percentile.

The upshot is that for small servers, it's equivalent to keeping all the samples and computing the percentiles exactly on each interval. For large servers, it processes batches of samples at a time (varying based on the desired error; 50 at a time for 1%) and computes a close estimate, using a small fraction of the samples.


## Built-in plugins

### InfluxDB

[InfluxDB](https://influxdb.com/), like Graphite, expects to receive a `POST` containing a summary of metrics from each server at a regular interval.

The influx observer receives each snapshot as it's computed and broadcast by crow, formats it into a document in InfluxDB format, and posts it to the configured host. You must provide the `request` module, or a module with a similar interface.

```javascript
var crow = require("crow-metrics");
var request = require("request");

var registry = new crow.MetricsRegistry();
crow.exportInflux(registry, request, { hostname: "my.influx.server:8086", database: "mydb" });
```

  - `exportInflux(registry, request, options = {})`

The available options are:

  - `hostname` - influxdb host (default: "influxdb.local:8086")
  - `database` - influxdb database name (default: "test")
  - `url` - use a custom url, instead of `http://(hostname)/write?db=(database)` (overrides `hostname` and `database` options)
  - `timeout` - how long to wait before giving up (msec, default 5000)
  - `log` - bunyan-style log for reporting errors


### Prometheus

[Prometheus](http://prometheus.io/) polls servers at a regular interval, expecting periodic metric summaries to be available via HTTP.

The prometheus observer attaches to any existing [express](http://expressjs.com/) app, and provides the prometheus text format:

```javascript
var crow = require("crow-metrics");
var express = require("express");

var registry = new crow.MetricsRegistry();
var app = express();
app.use("/metrics", crow.prometheusExporter(express, registry));
app.listen(9090);
```

The above code creates an HTTP server on port 9090, and provides a metrics summary to prometheus on the `/metrics` path. The summary is updated periodically as configured by the `MetricsRegistry`.

Counters and gauges are reported as-is, and distribution quantiles are reported as "summary" quantiles, in the format prometheus expects.


### Viz

For local debugging, sanity checking -- or simply because it's pretty -- you may want to provide a web display of metrics for your server.

Viz attaches a `RingBufferObserver` to your registry, which collects metrics over a rolling window (one hour, by default), and graphs this data with [peity](http://benpickles.github.io/peity/).

<img src="https://raw.githubusercontent.com/robey/node-crow/master/docs/crow-screenshot.png">

If you want a devoted port for this service:

```javascript
var crow = require("crow-metrics");
var express = require("express");

var metrics = new crow.MetricsRegistry();
crow.startVizServer(express, metrics, 8080);
```

This will create a page at `http://localhost:8080/`.

If you're already using express for your own services, and want to attach the viz pages to a side path, you can "use" it like this:

```javascript
var app = express();
app.use("/admin/viz", crow.viz(express, registry));
```


## License

Apache 2 (open-source) license, included in `LICENSE.txt`.


## Authors

@robey - Robey Pointer <robeypointer@gmail.com>
