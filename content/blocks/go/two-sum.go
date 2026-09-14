func twoSum(numbers []int, target int) (int, int, bool) {
	seen := make(map[int]int, len(numbers))
	for i, n := range numbers {
		if j, ok := seen[target-n]; ok {
			return j, i, true
		}
		seen[n] = i
	}
	return -1, -1, false
}
