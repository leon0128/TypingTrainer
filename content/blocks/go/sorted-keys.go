func printInventory(stock map[string]int) {
	names := slices.Sorted(maps.Keys(stock))
	for _, name := range names {
		fmt.Printf("%-10s %4d\n", name, stock[name])
	}
	total := 0
	for _, count := range stock {
		total += count
	}
	fmt.Printf("%-10s %4d\n", "total", total)
}
