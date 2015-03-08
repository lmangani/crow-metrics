"use strict";

const path = require("path");
const ring = require("./ring");

// find our static folder -> ./lib/crow/viz/viz.js -> ./static
const staticPath = path.resolve(require.resolve("../crow"), "../../static");

/*
 * create a sub-path on your existing web server for displaying per-server
 * metrics:
 *
 *     var app = express();
 *     var metrics = new crow.Registry();
 *     app.use("/viz", crow.viz(express, metrics));
 *     app.listen(8080);
 *
 * you can place it at any path you want.
 */
function viz(express, registry, span = ring.DEFAULT_SPAN) {
  let router = express.Router();
  router.use("/", express.static(staticPath));

  var observer = new ring.RingBufferObserver(registry, span);
  router.get("/metrics", (request, response) => {
    response.type("json");
    response.send(observer.toJson());
  });

  return router;
}

/*
 * if you don't have any other use for a web server, you can use this to
 * do the whole creation:
 *
 *     var metrics = new crow.Registry();
 *     crow.startVizServer(express, metrics);
 */
function startVizServer(express, registry, port = 8080) {
  const app = express();
  app.use("/", viz(express, registry));
  app.listen(port);
}


exports.startVizServer = startVizServer;
exports.viz = viz;
