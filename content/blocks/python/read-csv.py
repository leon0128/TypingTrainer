def total_by_category(path):
    totals = {}
    with open(path, newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            amount = decimal.Decimal(row["amount"])
            category = row["category"].strip()
            totals[category] = totals.get(category, decimal.Decimal(0)) + amount
    return dict(sorted(totals.items()))
