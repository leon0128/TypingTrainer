func validateSignup(name, email string, age int) error {
	var errs []error
	if strings.TrimSpace(name) == "" {
		errs = append(errs, errors.New("name is required"))
	}
	if !strings.Contains(email, "@") {
		errs = append(errs, fmt.Errorf("email %q is invalid", email))
	}
	if age < 13 || age > 130 {
		errs = append(errs, fmt.Errorf("age %d is out of range", age))
	}
	return errors.Join(errs...)
}
