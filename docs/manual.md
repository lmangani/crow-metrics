# crow-metrics manual

This manual is meant to cover every aspect of a fairly tiny library. The sections are all independent, so feel free to jump right to the section that sounds most relevant to your interests.

- [API](#api)
  - [MetricsRegistry](#metricsregistry)
  - [Snapshot](#snapshot)
- [Metrics objects](#metrics-objects)
  - [Gauge](#gauge)
  - [Counter](#counter)
  - [Distribution](#distribution)
- [How distributions work](#how-distributions-work)
- [Observers](#observers)
- [Built-in plugins](#built-in-plugins)
  - [InfluxDB](#influxdb)
  - [Prometheus](#prometheus)
  - [Viz](#viz)


## API

The top-level API consists of a [MetricsRegistry] class for recording metrics, and some classes and functions for reporting those metrics to other services at a regular interval.


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
    var registry = new crow.MetricsRegistry({ separator: "." });
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






  - `exportInflux(registry, request, options)`

    See the [influxdb plugin](#influxdb) below.

  - `prometheusExporter(express, registry)`

    See the [prometheus plugin](#prometheus) below.

  - `viz(express, registry, span = 60 * 60 * 1000)`

    See the [viz plugin](#viz) below.

  - `startVizServer(express, registry, port = 8080)`

    See the [viz plugin](#viz) below.


## Observers
