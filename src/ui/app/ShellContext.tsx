/*
 * Bridge context between the React shell and the compatibility feature mounts.
 * It carries the runtime that loads the vanilla controllers plus the callbacks
 * those controllers expect (navigate, announce, getSession) and a focus hook
 * the mount calls once its heading exists.
 */

import { createContext, useContext } from "react";
import type { ShellRuntime, SessionSnapshot } from "./types";

export interface ShellBridge {
  runtime: ShellRuntime;
  navigate: (
    href: string,
    options?: { replace?: boolean; focus?: boolean },
  ) => void;
  announce: (message: string) => void;
  getSession: () => SessionSnapshot;
  /**
   * Ask the shell to focus the page heading if a route change left focus
   * pending. A mounted feature calls this after each render so that the
   * heading it renders asynchronously still receives route-change focus.
   */
  requestHeadingFocus: () => void;
}

const ShellContext = createContext<ShellBridge | null>(null);

export function ShellProvider({
  value,
  children,
}: {
  value: ShellBridge;
  children: React.ReactNode;
}) {
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell(): ShellBridge {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within a ShellProvider.");
  }
  return ctx;
}
