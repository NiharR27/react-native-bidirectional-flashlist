export function multiply(a: number, b: number): Promise<number> {
  return Promise.resolve(a * b);
}

export function multiplyTimesTwo(a: number, b: number): Promise<number> {
  return Promise.resolve(a * b * 2);
}
