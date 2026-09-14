def sort_employees(employees):
    by_name = sorted(employees, key=operator.itemgetter("last", "first"))
    return sorted(
        by_name,
        key=lambda employee: (employee["department"], -employee["salary"]),
    )
