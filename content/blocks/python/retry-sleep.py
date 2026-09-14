def retry(task, attempts=3, delay=0.5):
    for attempt in range(1, attempts + 1):
        try:
            return task()
        except ConnectionError as error:
            if attempt == attempts:
                raise
            print(f"attempt {attempt} failed: {error}")
            time.sleep(delay * 2 ** (attempt - 1))
