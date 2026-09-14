type ElementType<T> = T extends readonly (infer U)[] ? U : T;
type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;
type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];
type Example = {
  count: number;
  increment(): void;
  reset(to: number): void;
};
type Methods = FunctionKeys<Example>;
