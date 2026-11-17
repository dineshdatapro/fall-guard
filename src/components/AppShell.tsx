import { ClipboardList, ShieldCheck, Watch } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { ThemeToggle } from "./ThemeToggle.tsx";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    isActive ? "text-primary" : "text-muted-foreground"
  }`;

export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg leading-none tracking-tight">KinAlert</p>
          </div>
          <p className="ml-auto hidden rounded-full bg-safe-bg px-2.5 py-1 text-xs font-semibold text-safe sm:inline">
            On this phone
          </p>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-6xl pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <nav
        aria-label="Primary"
        className="tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card"
      >
        <div className="mx-auto flex max-w-lg">
          <NavLink to="/" end className={tabClass}>
            <Watch className="h-5 w-5" aria-hidden="true" />
            Watch
          </NavLink>
          <NavLink to="/care" className={tabClass}>
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
            Desk
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
