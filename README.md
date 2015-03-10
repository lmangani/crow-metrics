# crow

<img src="docs/crow-small.png" align="right">

Crow is a library for collecting metrics about your server, similar to Twitter's Ostrich or Netflix's Servo.(*) It helps you track things like:

- How many requests am I handling per second?
- How many requests am I handling concurrently?
- What is the 90th percentile of latency in my database queries?

On a period of your choosing (for example, minutely) these metrics are summarized. You can then publish them to a graphing or monitoring system like Riemann, InfluxDB, Graphite, or Prometheus.

The goal of crow is to make it *dead simple* to collect and report these metrics, and to motivate you to add them everywhere!

(*) Servo? Crow? GET IT? Ha ha ha.

## Example

Here's a quick example of a web service that counts requests and response times, and publishes them in a format prometheus can poll:

```javascript
var crow = require("crow-metrics");
var express = require("express");

var webService = express();

// one registry to rule them all, publishing once a minute.
var metrics = new crow.Registry({ period: 60000 });

// publish metrics to /metrics, formatted for prometheus.
webService.use("/metrics", crow.prometheusExporter(express, metrics));

webService.get("/", function (request, response) {
  metrics.counter("request_count").increment();

  metrics.distribution("request_time_msec").time(function () {
    response.send("Hello!\n");
  });
});
```

## How does it work?

Metrics consist of:

- counters: things that only increase, like the number of requests handled since the server started.
- gauges: dials that measure a changing state, like the number of currently open connections, or the amount of memory being used.
- distributions: samples that are interesting for their histogram, like timings (95th percentile of database reads, for example).

Metrics are collected in a `Registry` (usually you create only one). On a configurable period, these metrics are summarized and sent to observers. The observers can push the summary to a push-based service like Riemann, or post the results to a web service for a poll-based service like Prometheus.

FIXME tags...


## API

- `new Registry(options)`

  The registry is the central coordinator for metrics collection and dispersal. It tracks metrics in a single namespace, and periodically takes a snapshot and sends it to any observers. (A typical observer might push the metrics into riemann, influxdb, or prometheus.)

  Options:

  - `period` (in milliseconds) - how often to send snapshots to observers; default is 60_000, or one minute
  - `log` - a bunyan-compatible logger to use for debug logs; if no log is provided, nothing is logged
  - `percentiles` (array) - percentiles to collect on distributions, as a real number between 0 and 1; default is `[ 0.5, 0.9, 0.99 ]`, or the 50th (median), 90th, and 99th percentiles
  - `error` - number between 0 and 1 representing the rank error allowed when estimating percentiles; default is 0.01 (1%) which is usually fine
  - `tags` - FIXME

  The `percentiles` and `error` options are used as defaults and may be overridden by individual distributions. For more about how the distributions are calculated, see [distributions](#distributions) below.

- `prometheusExporter(express, registry)`

  FIXME

- `viz(express, registry, span = 60 * 60 * 1000)`

  FIXME

- `startVizServer(express, registry, port = 8080)`

  FIXME

### Registry

FIXME...

## Distributions

This section is for people curious about how distribution percentiles are calculated.

Distributions are collected and sampled using a method described in ["Effective Computation of Biased Quantiles over Data Streams"](http://www.cs.rutgers.edu/~muthu/bquant.pdf). It attempts to keep only the samples closest to the desired percentiles, so for example, if you only want the median, it keeps most of the samples that fall in the middle of the range, but discards samples on either end. To do this, the algorithm needs to know the desired percentiles, and the allowable error.

For most uses, this is overkill. If you specify an allowable rank error of 1%, and have fewer than 100 samples each minute, it's unlikely to discard _any_ of the samples, and will compute the percentiles directly.

FIXME...

## TBD (more later here)

xxx

## Built-in plugins

### Prometheus

[Prometheus](http://prometheus.io/) polls servers at a regular interval, expecting periodic metric summaries to be available via HTTP.

The prometheus observer attaches to any existing [express](http://expressjs.com/) app, and provides the prometheus text format:

```javascript
var crow = require("crow-metrics");
var express = require("express");

var registry = new crow.Registry();
var app = express();
app.use("/metrics", crow.prometheusExporter(express, registry));
app.listen(9090);
```

The above code creates an HTTP server on port 9090, and provides a metrics summary to prometheus on the `/metrics` path. The summary is updated periodically as configured by the `Registry`.

Counters and gauges are reported as-is, and distribution quantiles are reported as "summary" quantiles, in the format prometheus expects.

### Viz

For local debugging, sanity checking -- or simply because it's pretty -- you may want to provide a web display of metrics for your server.

Viz attaches a `RingBufferObserver` to your registry, which collects metrics over a rolling window (one hour, by default), and graphs this data with [peity](http://benpickles.github.io/peity/).

<img src="https://raw.githubusercontent.com/robey/node-crow/master/docs/crow-screenshot.png">

If you want a devoted port for this service:

```javascript
var crow = require("crow-metrics");
var express = require("express");

var metrics = new crow.Registry();
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
