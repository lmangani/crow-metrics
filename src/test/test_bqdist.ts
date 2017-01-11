import { BiasedQuantileDistribution } from "..";

import "should";
import "source-map-support/register";


class PseudoRandom {
  constructor(public seed: number) {
    // pass.
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  powerDistribution(count: number, max: number, exponent: number): number[] {
    // ES6 has no "to/until" :(
    const rv: number[] = [];
    for (let i = 0; i < count; i++) {
      rv.push(Math.floor(Math.pow(this.next(), exponent) * max));
    }
    return rv;
  }
}

function rankError(sortedSamples: number[], percentile: number, estimate: number): number {
  const index = Math.floor(percentile * sortedSamples.length);
  let i = 0;
  while (index + i < 0 || index + i >= sortedSamples.length || sortedSamples[index + i] != estimate) {
    // 0, 1, -1, 2, -2, ...
    i = i > 0 ? -i : -i + 1;
  }
  return Math.abs(i / sortedSamples.length);
}

function validate(dist: BiasedQuantileDistribution, samples: number[]): void {
  dist.reset();
  samples.forEach(v => dist.record(v));
  const sorted = samples.slice();
  sorted.sort((a, b) => a - b);
  const snapshot = dist.resetWithSnapshot();
  dist.percentiles.forEach(p => rankError(sorted, p, snapshot.getPercentile(p)).should.not.be.greaterThan(dist.error));
  snapshot.sampleCount.should.eql(samples.length);
  snapshot.sampleSum.should.eql(samples.reduce((a, b) => a + b));
}

describe("BiasedQuantileDistribution", () => {
  // this test is really long, but it assures me that the algorithm was implemented correctly.
  it("calculate percentiles within an error range", () => {
    const percentiles = [ 0.5, 0.75, 0.9, 0.95 ];
    const error = 0.01;
    const dist = new BiasedQuantileDistribution(percentiles, error);

    for (let seed = 1337; seed < 1347; seed++) {
      for (let power = 1; power <= 3; power++) {
        const prng = new PseudoRandom(seed);

        [ 30, 100, 1000 ].forEach((size) => {
          const samples = prng.powerDistribution(size, 50000, power);
          validate(dist, samples);
          samples.sort((a, b) => a - b);
          validate(dist, samples);
          samples.sort((a, b) => b - a);
          validate(dist, samples);
        });

        const samples = prng.powerDistribution(5000, 100000, power);
        validate(dist, samples);
        samples.sort((a, b) => a - b);
        validate(dist, samples);
        samples.sort((a, b) => b - a);
        validate(dist, samples);
      }
    }
  });
});
