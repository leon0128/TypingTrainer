static String describeDeadline(LocalDate today, LocalDate deadline) {
  long days = ChronoUnit.DAYS.between(today, deadline);
  String date = deadline.format(DateTimeFormatter.ISO_LOCAL_DATE);
  if (days < 0) {
    return "overdue since " + date;
  } else if (days == 0) {
    return "due today";
  }
  return "due in " + days + " days on " + deadline.getDayOfWeek();
}
