func statusFor(err error) int {
	var syntaxErr *json.SyntaxError
	switch {
	case err == nil:
		return 200
	case errors.Is(err, os.ErrNotExist):
		return 404
	case errors.As(err, &syntaxErr):
		return 400
	case errors.Is(err, context.DeadlineExceeded):
		return 504
	default:
		return 500
	}
}
