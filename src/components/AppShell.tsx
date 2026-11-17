import { ShieldCheck } from "lucide-react";
import { NavLink, Outlet } from "react-router";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
    isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
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
      <header className="border-b border-border/80 bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-xl leading-none">KinAlert</p>
              <p className="mt-1 text-xs text-muted-foreground">Fall watch for the phone. Alerts for the caregiver.</p>
            </div>
          </div>
          <nav className="flex items-center gap-1" aria-label="Primary">
            <NavLink to="/" className={linkClass} end>
              Phone watch
            </NavLink>
            <NavLink to="/care" className={linkClass}>
              Caregiver desk
            </NavLink>
          </nav>
          <p className="ml-auto rounded-full border border-primary/20 bg-accent px-3 py-1 text-xs font-semibold text-primary">
            Video stays on this phone
          </p>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs leading-relaxed text-muted-foreground md:px-8">
        Prototype for an M.Tech demonstration. KinAlert is not a medical device and must not be the only way someone
        calls for help.
      </footer>
    </div>
  );
}
