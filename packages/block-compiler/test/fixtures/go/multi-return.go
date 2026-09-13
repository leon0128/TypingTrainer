func divide(a, b int) (int, error) {
	if b == 0 {
		return 0, errors.New("division by zero")
	}
	q, r := a/b, a%b
	return q + r, nil
}
