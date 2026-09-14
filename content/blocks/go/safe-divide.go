func safeDivide(a, b int) (quotient int, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("recovered: %v", r)
		}
	}()
	quotient = a / b
	return quotient, nil
}
