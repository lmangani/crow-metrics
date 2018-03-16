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

Here's a quick example of a web service that counts requests and response times, and publishes them to an [InfluxDB](http://influxdb.com/) server:

```javascript
const crow = require("crow-metrics");
const request = require("request");

const webService = express();

// one registry to rule them all, publishing once a minute.
const metrics = crow.Metrics.create({ period: 60000 });

// publish metrics to InfluxDB.
crow.exportInfluxDb(metrics.events, { hostname: "influxdb.prod.example.com:8086", database: "prod" });

// track heap-used as a gauge.
// the function will be called on-demand, once a minute.
const heapUsed = metrics.gauge("heap_used");
metrics.setGauge(heapUsed, function () { return process.memoryUsage().heapUsed; });

// my website.
const requestCount = metrics.counter("request_count");
const requestTime = metrics.distribution("request_time_msec");
webService.get("/", function (request, response) {
  // count incoming requests:
  metrics.increment(requestCount);

  // time how long it takes to respond:
  metrics.time(requestTime, function () {
    response.send("Hello!\n");
  });
});
```


## How does it work?

Metrics are collected in a `Registry` (usually there is only one). On a configurable period, these metrics are summarized and sent to listeners. The listeners can push the summary to a push-based service like Graphite, or post the results to a web service for a poll-based service like Prometheus.

-----xxx----- FIXME link to manual.md
Metrics consist of:

  - **counters**: numbers that increase only (never decrease), like the number of requests handled since the server started.
  - **gauges**: dials that measure a changing state, like the number of currently open connections, or the amount of memory being used.
  - **distributions**: samples that are interesting for their histogram, like timings (95th percentile of database reads, for example).



## License

Apache 2 (open-source) license, included in `LICENSE.txt`.


## Authors

@robey - Robey Pointer <robeypointer@gmail.com>




## FIXME

- mention node 8 requirement for async/await and perf timings
