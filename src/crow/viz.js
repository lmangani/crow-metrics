"use strict";

import path from "path";
import { RingBufferObserver } from "./ring";

// find our static folder -> ./lib/crow/viz/viz.js -> ./static
const staticPath = path.resolve(require.resolve(".."), "../../static");

/*
 * create a sub-path on your existing web server for displaying per-server
 * metrics:
 *
 *     const app = express();
 *     const metrics = new crow.Registry();
 *     app.use("/viz", crow.viz(express, metrics));
 *     app.listen(8080);
 *
 * you can place it at any path you want.
 */
export function viz(express, registry, span) {
  const router = express.Router();
  router.use("/", express.static(staticPath));

  const observer = new RingBufferObserver(registry, span);
  router.get("/history.json", (request, response) => {
    response.type("json");
    response.send(observer.toJson());
  });

  router.get("/debug.json", (request, response) => {
    response.type("json");
    response.send(observer.get());
  });

  router.get("/current.json", (request, response) => {
    const latest = observer.getLatest().flatten();
    response.type("json");
    response.send(JSON.stringify(latest));
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
export function startVizServer(express, registry, port = 8080) {
  const app = express();
  app.use("/", viz(express, registry));
  app.listen(port);
}
