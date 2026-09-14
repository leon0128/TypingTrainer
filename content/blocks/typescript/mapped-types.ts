type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Nullable<T> = { [K in keyof T]: T[K] | null };
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};
interface User {
  readonly id: number;
  name: string;
}
type UserGetters = Getters<User>;
type EditableUser = Mutable<Nullable<User>>;
