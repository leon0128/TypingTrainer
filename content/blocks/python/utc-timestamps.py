def to_local_times(timestamps, zone="Asia/Tokyo"):
    tz = zoneinfo.ZoneInfo(zone)
    result = []
    for ts in timestamps:
        moment = datetime.datetime.fromtimestamp(ts, tz=datetime.UTC)
        result.append(moment.astimezone(tz).strftime("%Y-%m-%d %H:%M %Z"))
    return result
