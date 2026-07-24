/*
 * Application composition root: the TanStack Query provider, the toast
 * provider, a React Router browser router, and the application error boundary,
 * composed around the React application shell. A single catch-all route hands
 * every application location to the shell, which resolves it through the shared
 * typed route map (routing.ts) — so canonical URL matching, redirects, and
 * not-found handling stay in one place and cannot drift from the legacy shell's
 * route table.
 */

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../components";
import { AppLayout } from "./AppLayout";
import { ErrorBoundary } from "./ErrorBoundary";
import { defaultShellRuntime } from "./featureRuntime";
import type { ShellRuntime } from "./types";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Authorization and lifecycle are re-checked server-side per request;
        // the client never silently retries a denied call into a different
        // answer. Explicit "Try again" affordances drive refetches instead.
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  });
}

/** Global providers (query + toast). Composable so tests can supply their own
 * router around the shell routes. */
export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

/** The error-bounded route map that hands every location to the shell. */
export function ShellRoutes({ runtime }: { runtime: ShellRuntime }): ReactNode {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="*" element={<AppLayout runtime={runtime} />} />
      </Routes>
    </ErrorBoundary>
  );
}

export function App({
  runtime = defaultShellRuntime,
  queryClient,
}: {
  runtime?: ShellRuntime;
  queryClient?: QueryClient;
}): ReactNode {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <AppProviders queryClient={client}>
      <BrowserRouter>
        <ShellRoutes runtime={runtime} />
      </BrowserRouter>
    </AppProviders>
  );
}
