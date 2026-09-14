const HTTP_STATUS = {
  ok: 200,
  notFound: 404,
  serverError: 500,
} as const;
type StatusName = keyof typeof HTTP_STATUS;
function describeStatus(code: number): StatusName | "unknown" {
  const names = Object.keys(HTTP_STATUS) as StatusName[];
  return names.find((name) => HTTP_STATUS[name] === code) ?? "unknown";
}
