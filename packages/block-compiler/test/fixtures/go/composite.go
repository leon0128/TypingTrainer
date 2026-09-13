func defaults() map[string][]int {
	type limit struct {
		Name string
		Max  int
	}
	limits := []limit{{Name: "cpu", Max: 4}, {Name: "memory", Max: 512}}
	sizes := map[string][]int{
		"small":  {1, 2},
		"medium": {4, 8, 16},
		"none":   {},
	}
	for _, l := range limits {
		sizes[l.Name] = []int{l.Max}
	}
	return sizes
}
