import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { RouteErrorState } from "@/components/state/RouteErrorState";
import { reportError } from "@/lib/errorReporting";

export function AppErrorPage() {
  const error = useRouteError();
  const routeError = isRouteErrorResponse(error) ? error : null;
  const title = routeError?.status === 404 ? "Page not found" : "Something went wrong";
  const description = routeError?.status === 404 ? "We could not find that page. The link may have changed, but you can keep exploring from the map." : "We hit a problem loading this page. Try again, or head back to the map.";
  const devDetail = import.meta.env.DEV ? getErrorDetail(error) : null;

  // A 404 is a bad link, not a fault in the app.
  useEffect(() => {
    if (routeError?.status === 404) return;
    reportError(error, { source: "route_error", status: routeError?.status ?? null, path: window.location.pathname });
  }, [error, routeError?.status]);

  return <RouteErrorState title={title} description={description} devDetail={devDetail} showRetry={routeError?.status !== 404} />;
}

function getErrorDetail(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`;
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return null;
}
