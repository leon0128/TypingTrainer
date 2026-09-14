type Tree[T cmp.Ordered] struct {
	Value T
	Left  *Tree[T]
	Right *Tree[T]
	Count int
}
