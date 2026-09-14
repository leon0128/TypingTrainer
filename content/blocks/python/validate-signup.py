def validate_signup(form):
    errors = []
    username = form.get("username", "").strip()
    if not 3 <= len(username) <= 20:
        errors.append("username must be 3-20 characters")
    if "@" not in form.get("email", ""):
        errors.append("email must contain @")
    if form.get("password") != form.get("confirm"):
        errors.append("passwords do not match")
    return errors
