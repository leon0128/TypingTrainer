function daysBetween(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  );
  const last = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
