async def fetch_all(urls, fetch, seconds=10):
    async with asyncio.timeout(seconds):
        async with asyncio.TaskGroup() as group:
            tasks = {url: group.create_task(fetch(url)) for url in urls}
    return {url: task.result() for url, task in tasks.items()}
