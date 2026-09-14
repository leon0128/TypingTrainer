func shortestPath(grid []string, start, goal [2]int) int {
	dist := map[[2]int]int{start: 0}
	queue := [][2]int{start}
	for len(queue) > 0 {
		cell := queue[0]
		queue = queue[1:]
		if cell == goal {
			return dist[cell]
		}
		for _, d := range [][2]int{{0, 1}, {1, 0}, {0, -1}, {-1, 0}} {
			next := [2]int{cell[0] + d[0], cell[1] + d[1]}
			if next[0] < 0 || next[0] >= len(grid) || next[1] < 0 || next[1] >= len(grid[0]) {
				continue
			}
			if _, visited := dist[next]; visited || grid[next[0]][next[1]] == '#' {
				continue
			}
			dist[next] = dist[cell] + 1
			queue = append(queue, next)
		}
	}
	return -1
}
