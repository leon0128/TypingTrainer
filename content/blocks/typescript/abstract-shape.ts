abstract class Shape {
  abstract area(): number;
  describe(): string {
    return `${this.constructor.name} with area ${this.area().toFixed(2)}`;
  }
}
class Circle extends Shape {
  constructor(private readonly radius: number) {
    super();
  }
  area(): number {
    return Math.PI * this.radius ** 2;
  }
}
