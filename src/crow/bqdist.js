"use strict";

// immutable snapshot of the samples, for calculating percentiles.
class Snapshot {
  constructor(dist) {
    this.samples = dist.samples.slice();
    this.sampleCount = dist.sampleCount;
    this.sampleSum = dist.sampleSum;
    this.deltasWithinBucket = dist.deltasWithinBucket.slice();
    this.deltasBetweenBuckets = dist.deltasBetweenBuckets.slice();
    this.percentiles = dist.percentiles;
    this.error = dist.error;
  }

  getPercentile(percentile) {
    if (this.samples.length == 0) return 0;
    const desiredRank = Math.floor(this.sampleCount * percentile);
    const desiredMaxError = computeAllowedRankError(this.percentiles, this.error, this.sampleCount, desiredRank) / 2;
    let rank = 0;
    let i = 1;
    const nextRank = i => {
      return rank + this.deltasBetweenBuckets[i] + this.deltasWithinBucket[i];
    };
    while (i < this.samples.length && nextRank(i) <= desiredRank + desiredMaxError) {
      rank += this.deltasBetweenBuckets[i];
      i += 1;
    }
    if (i > 0) i -= 1;
    return this.samples[i];
  }
}

/*
 * Collect samples over a time period, keeping only enough data to compute
 * specific percentiles within a desired error range.
 *
 * This algorithm comes from the paper "Effective Computation of Biased
 * Quantiles over Data Streams".
 *
 * - percentiles: list of desired percentiles (median = 0.5)
 * - error: error allowed in the rank of the reported measurement
 */
export default class BiasedQuantileDistribution {
  constructor(percentiles = [ 0.5, 0.9, 0.95 ], error = 0.01) {
    this.percentiles = percentiles;
    this.error = error;
    this.buffer = [];
    this.bufferSize = Math.floor(1 / (2 * error));
    // 3 parallel arrays to minimize overhead
    this.samples = [];
    this.deltasWithinBucket = []; // "delta" in the paper
    this.deltasBetweenBuckets = []; // "g" in the paper*
    // total samples that there ever were (even the ones we dropped)
    this.sampleCount = 0;
    // sum of all the samples that ever were
    this.sampleSum = 0;
  }

  // * academics are not good at naming things.

  // add a sample.
  record(data) {
    this.buffer.push(data);
    if (this.buffer.length > this.bufferSize) this.flush();
  }

  // clear the samples, returning a snapshot of the previous results.
  resetWithSnapshot() {
    const rv = this.snapshot();
    this.reset();
    return rv;
  }

  // clear out any previously stored samples, and start over.
  reset() {
    this.sampleCount = 0;
    this.sampleSum = 0;
    this.samples = [];
    this.deltasWithinBucket = [];
    this.deltasBetweenBuckets = [];
  }

  // return an immutable view of the current sample set, for querying.
  snapshot() {
    if (this.buffer.length > 0) this.flush();
    return new Snapshot(this);
  }

  // ----- internals:

  // merge-sort the buffer into the existing samples, dropping unneeded ones.
  flush() {
    this.buffer.sort((a, b) => a - b);
    const bufferLength = this.buffer.length;

    let rank = 0;
    let bi = 0;
    let si = 0;

    const bucketsCompactable = () => {
      const combinedRankError = this.deltasBetweenBuckets[si] +
        this.deltasBetweenBuckets[si + 1] +
        this.deltasWithinBucket[si + 1];
      return combinedRankError <= Math.floor(this.allowedRankError(rank));
    };

    while (bi < bufferLength || si < this.samples.length) {
      if (si > 0 && si + 1 < this.samples.length && bucketsCompactable()) {
        // combine the samples
        this.deltasBetweenBuckets[si + 1] += this.deltasBetweenBuckets[si];
        this.samples.splice(si, 1);
        this.deltasBetweenBuckets.splice(si, 1);
        this.deltasWithinBucket.splice(si, 1);
      } else if (bi < bufferLength && (si == this.samples.length || this.samples[si] >= this.buffer[bi])) {
        // insert!
        const uncertainty = si == 0 ?
          0 :
          Math.floor(this.allowedRankError(rank - this.deltasBetweenBuckets[si - 1])) - 1;
        this.sampleCount += 1;
        this.sampleSum += this.buffer[bi];
        this.samples.splice(si, 0, this.buffer[bi]);
        this.deltasBetweenBuckets.splice(si, 0, 1);
        this.deltasWithinBucket.splice(si, 0, uncertainty < 0 ? 0 : uncertainty);
        bi += 1;
      } else if (si < this.samples.length) {
        rank += this.deltasBetweenBuckets[si];
        si += 1;
      }
    }

    this.buffer = [];
  }

  allowedRankError(rank) {
    return computeAllowedRankError(this.percentiles, this.error, this.sampleCount, rank);
  }
}

function computeAllowedRankError(percentiles, error, sampleCount, rank) {
  let rv = Number.POSITIVE_INFINITY;
  for (let i = 0; i < percentiles.length; i++) {
    const p = percentiles[i];
    const rankError = (rank <= p * sampleCount) ? rank / p : (sampleCount - rank) / (1 - p);
    if (rankError < rv) rv = rankError;
  }
  return rv * 2 * error;
}
