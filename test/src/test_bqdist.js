var bqdist = require("../../lib/crow/bqdist");
var should = require("should");
var util = require("util");

require("source-map-support").install();

class PseudoRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  powerDistribution(count, max, exponent) {
    // ES6 has no "to/until" :(
    let rv = [];
    for (let i = 0; i < count; i++) {
      rv.push(Math.floor(Math.pow(this.next(), exponent) * max));
    }
    return rv;
  }
}

function rankError(sortedSamples, percentile, estimate) {
  let index = Math.floor(percentile * sortedSamples.length);
  let i = 0;
  while (index + i < 0 || index + i >= sortedSamples.length || sortedSamples[index + i] != estimate) {
    // 0, 1, -1, 2, -2, ...
    i = i > 0 ? -i : -i + 1;
  }
  return Math.abs(i / sortedSamples.length);
}

function validate(dist, samples) {
  dist.reset();
  samples.forEach((v) => dist.record(v));
  let sorted = samples.slice();
  sorted.sort((a, b) => a - b);
  let snapshot = dist.reset();
  dist.percentiles.forEach((p) => rankError(sorted, p, snapshot.getPercentile(p)).should.not.be.greaterThan(dist.error));
}

describe("BiasedQuantileDistribution", () => {
  // this test is really long, but it assures me that the algorithm was implemented correctly.
  it("calculate percentiles within an error range", () => {
    let percentiles = [ 0.5, 0.75, 0.9, 0.95 ];
    let error = 0.01;
    let dist = new bqdist.BiasedQuantileDistribution(percentiles, error);

    for (let seed = 1337; seed < 1347; seed++) {
      for (let power = 1; power <= 3; power++) {
        let prng = new PseudoRandom(seed);

        [ 30, 100, 1000 ].forEach((size) => {
          let samples = prng.powerDistribution(size, 50000, power);
          validate(dist, samples);
          samples.sort((a, b) => a - b);
          validate(dist, samples);
          samples.sort((a, b) => b - a);
          validate(dist, samples);
        });

        let samples = prng.powerDistribution(5000, 100000, power);
        validate(dist, samples);
        samples.sort((a, b) => a - b);
        validate(dist, samples);
        samples.sort((a, b) => b - a);
        validate(dist, samples);
      }
    }
  });
});
