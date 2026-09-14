type Route = { path: string; auth: boolean };
const routes = {
  home: { path: "/", auth: false },
  dashboard: { path: "/dashboard", auth: true },
  settings: { path: "/settings", auth: true },
} satisfies Record<string, Route>;
const protectedPaths = Object.values(routes)
  .filter((route) => route.auth)
  .map((route) => route.path);
