"use strict";

import BiasedQuantileDistribution from "./crow/bqdist";
import Registry from "./crow/registry";

export {
  BiasedQuantileDistribution,
  Registry
};


// re-exporter

/*
let metrics = require("./crow/metrics");
let prometheus = require("./crow/prometheus");
let ring = require("./crow/ring");
let viz = require("./crow/viz");

exports.MetricType = metrics.MetricType;
exports.prometheusExporter = prometheus.prometheusExporter;
exports.PrometheusObserver = prometheus.PrometheusObserver;
exports.RingBufferObserver = ring.RingBufferObserver;
exports.startVizServer = viz.startVizServer;
exports.viz = viz.viz;
*/
