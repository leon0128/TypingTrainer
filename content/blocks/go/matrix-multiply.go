func multiply(a, b [][]float64) ([][]float64, error) {
	if len(a) == 0 || len(b) == 0 || len(a[0]) != len(b) {
		return nil, errors.New("incompatible matrix sizes")
	}
	result := make([][]float64, len(a))
	for i := range a {
		result[i] = make([]float64, len(b[0]))
		for j := range b[0] {
			for k := range b {
				result[i][j] += a[i][k] * b[k][j]
			}
		}
	}
	return result, nil
}
