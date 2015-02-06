# crow

Crow is a library for collecting metrics about your server, similar to Twitter's Ostrich or Netflix's Servo. It helps you track things like:

- How many requests am I handling per second?
- How many requests am I handling concurrently?
- What is the 90th percentile of latency in my database queries?

On a period of your choosing (for example, minutely) these metrics are summarized. You can then publish them to a graphing or monitoring system like Riemann, InfluxDB, Graphite, or Prometheus.

## Example

Here's a quick example of a web service that counts requests and response times, and publishes them in a format prometheus can poll:

```javascript
var crow = require("crow-metrics");
var express = require("express");

// one registry to rule them all, publishing once a minute.
var metrics = new crow.Registry({ period: 60000 });

// publish metrics to a web service on port 9090
new crow.PrometheusObserver(metrics).startService(express);

var webService = express();
express.get("/", function (request, response) {
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
- distributions: samples that are interesting for their histogram, like timings.

Metrics are collected in a `Registry` (usually you create only one). On a configurable period, these metrics are summarized and sent to observers. The observers can push the summary to a push-based service like Riemann, or post the results to a web service for a poll-based service like Prometheus.

<3
xxx more later xxx
<3
