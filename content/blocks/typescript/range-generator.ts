function* range(start: number, end: number, step = 1): Generator<number> {
  if (step === 0) {
    throw new RangeError("step must not be zero");
  }
  for (let value = start; step > 0 ? value < end : value > end; value += step) {
    yield value;
  }
}
