def find_users(db_path, min_age):
    with contextlib.closing(sqlite3.connect(db_path)) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT name, email FROM users WHERE age >= ? ORDER BY name",
            (min_age,),
        ).fetchall()
    return [dict(row) for row in rows]
