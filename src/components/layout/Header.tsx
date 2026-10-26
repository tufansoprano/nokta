import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Wordmark } from "@/components/layout/Wordmark";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useVenuePreferences } from "@/context/VenuePreferencesContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { cn } from "@/lib/utils";
import { BarChart3, Bell, BookOpenCheck, Building2, CalendarDays, ChevronDown, ClipboardPenLine, CreditCard, Inbox, LayoutDashboard, MapPin, Megaphone, Menu, MessageSquare, Moon, ShieldCheck, Sun, UserCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";

// "Plan a night" replaces Recommend; the recommend flow lives inside it as "Pick for us".
const PRIMARY_LINKS = [
  { to: "/", label: "Map", end: true },
  { to: "/plan", label: "Plan a night" },
  { to: "/saved", label: "Saved" },
] as const;

const OWNER_MENU_ITEMS = [
  { label: "Home", to: "/owner", icon: LayoutDashboard, end: true },
  { label: "My venues", to: "/owner/venues", icon: Building2 },
  { label: "Bookings", to: "/owner/bookings", icon: CalendarDays },
  { label: "Inbox", to: "/owner/inbox", icon: Inbox },
  { label: "Marketing", to: "/owner/promotions", icon: Megaphone },
  { label: "Plan & billing", to: "/owner/billing", icon: CreditCard },
] as const;

const ADMIN_MENU_ITEMS = [
  { label: "Venues", to: "/admin/venues", icon: MapPin },
  { label: "Review queue", to: "/admin/review", icon: ClipboardPenLine },
  { label: "Demand", to: "/admin/demand", icon: MessageSquare },
  { label: "Commercial", to: "/admin/commercial", icon: CreditCard },
  { label: "Insights", to: "/admin/insights", icon: BarChart3 },
] as const;

function SavedCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-nokta-accent-tint px-1.5 text-[11px] font-semibold tabular-nums text-nokta-accent-dark">
      {count}
      <span className="sr-only"> saved</span>
    </span>
  );
}

function MobileSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0">
      {title ? <h3 className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{title}</h3> : null}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export function Header() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { theme, toggleTheme } = useTheme();
  const { favouriteVenueIds } = useVenuePreferences();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const savedCount = favouriteVenueIds.length;
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative inline-flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors",
      "after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-nokta-accent after:transition-opacity",
      isActive ? "text-nokta-ink after:opacity-100" : "text-nokta-ink-muted after:opacity-0 hover:bg-nokta-hover hover:text-nokta-ink",
    );
  const accountMenuLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );
  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors",
      isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );
  const mobilePrimaryLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex min-h-12 items-center rounded-lg px-3 text-lg font-semibold transition-colors",
      isActive ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground",
    );

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-[1200] border-b border-nokta-border bg-nokta-surface-alt/90 backdrop-blur">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link to="/" className="shrink-0 text-nokta-ink" aria-label="nokta home">
              <Wordmark />
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
              {PRIMARY_LINKS.map((link) => (
                <NavLink key={link.to} end={"end" in link ? link.end : undefined} to={link.to} className={navLinkClass}>
                  {link.label}
                  {link.to === "/saved" ? <SavedCount count={savedCount} /> : null}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden items-center gap-2 text-sm md:flex">
            <NavLink to="/for-venues" className={navLinkClass}>
              For venues
            </NavLink>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-nokta-border" />
            <ThemeToggle />
            <NotificationBell />
            {user ? (
              <div ref={accountMenuRef} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 rounded-full px-3 text-sm font-medium text-nokta-ink-muted hover:text-nokta-ink"
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((isOpen) => !isOpen)}
                >
                  <UserCircle className="h-4 w-4" />
                  Account
                  <ChevronDown className={cn("h-4 w-4 transition-transform", accountMenuOpen ? "rotate-180" : "")} />
                </Button>
                {accountMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-12 z-[1400] max-h-[calc(100vh-5rem)] w-64 overflow-y-auto rounded-xl border bg-card p-2 text-card-foreground shadow-xl"
                  >
                    <NavLink end to="/account" className={accountMenuLinkClass} role="menuitem" onClick={() => setAccountMenuOpen(false)}>
                      <UserCircle className="h-4 w-4" />
                      Account settings
                    </NavLink>
                    <NavLink to="/account/bookings" className={accountMenuLinkClass} role="menuitem" onClick={() => setAccountMenuOpen(false)}>
                      <BookOpenCheck className="h-4 w-4" />
                      My bookings
                    </NavLink>
                    <NavLink to="/account/notifications" className={accountMenuLinkClass} role="menuitem" onClick={() => setAccountMenuOpen(false)}>
                      <Bell className="h-4 w-4" />
                      Notifications
                    </NavLink>
                    <div className="my-2 border-t" />
                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
                      <LayoutDashboard className="h-3.5 w-3.5" />
                      Owner
                    </div>
                    {OWNER_MENU_ITEMS.map((item) => {
                      const Icon = item.icon;
                      return <NavLink key={item.to} end={"end" in item ? item.end : undefined} to={item.to} className={accountMenuLinkClass} role="menuitem" onClick={() => setAccountMenuOpen(false)}><Icon className="h-4 w-4" />{item.label}</NavLink>;
                    })}
                    {isAdmin ? (
                      <>
                        <div className="my-2 border-t" />
                        <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Admin
                        </div>
                        {ADMIN_MENU_ITEMS.map((item) => {
                          const Icon = item.icon;
                          return <NavLink key={item.to} to={item.to} className={accountMenuLinkClass} role="menuitem" onClick={() => setAccountMenuOpen(false)}><Icon className="h-4 w-4" />{item.label}</NavLink>;
                        })}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                to="/sign-in"
                className="ml-1 inline-flex h-9 items-center rounded-full bg-nokta-ink px-4 text-sm font-semibold text-nokta-surface transition-opacity hover:opacity-85"
              >
                Sign in
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1 md:hidden">
            <NotificationBell />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={savedCount > 0 ? `Open menu, ${savedCount} saved` : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetHeader>
          <SheetTitle className="text-nokta-ink">
            <Wordmark />
          </SheetTitle>
          <SheetClose onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" />
        </SheetHeader>
        <nav
          aria-label="Menu"
          className="-mx-3 flex flex-col"
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a")) {
              setMobileMenuOpen(false);
            }
          }}
        >
          <MobileSection>
            {PRIMARY_LINKS.map((link) => (
              <NavLink key={link.to} end={"end" in link ? link.end : undefined} to={link.to} className={mobilePrimaryLinkClass}>
                {link.label}
                {link.to === "/saved" ? <SavedCount count={savedCount} /> : null}
              </NavLink>
            ))}
          </MobileSection>
          {user ? (
            <MobileSection title="Your account">
              <NavLink end to="/account" className={mobileNavLinkClass}>
                <UserCircle className="h-4 w-4" />
                Account settings
              </NavLink>
              <NavLink to="/account/bookings" className={mobileNavLinkClass}>
                <BookOpenCheck className="h-4 w-4" />
                My bookings
              </NavLink>
              <NavLink to="/account/notifications" className={mobileNavLinkClass}>
                <Bell className="h-4 w-4" />
                Notifications
              </NavLink>
            </MobileSection>
          ) : (
            <MobileSection>
              <div className="grid grid-cols-2 gap-2 px-3 py-1">
                <Link to="/sign-in" className="inline-flex h-11 items-center justify-center rounded-full bg-nokta-ink text-sm font-semibold text-nokta-surface">
                  Sign in
                </Link>
                <Link to="/sign-up" className="inline-flex h-11 items-center justify-center rounded-full border border-nokta-border text-sm font-semibold text-nokta-ink">
                  Create account
                </Link>
              </div>
            </MobileSection>
          )}
          <MobileSection title="Venue owners">
            <NavLink to="/for-venues" className={mobileNavLinkClass}>
              <Building2 className="h-4 w-4" />
              For venues
            </NavLink>
            {user
              ? OWNER_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} end={"end" in item ? item.end : undefined} to={item.to} className={mobileNavLinkClass}><Icon className="h-4 w-4" />{item.label}</NavLink>;
                })
              : null}
          </MobileSection>
          {isAdmin ? (
            <MobileSection title="Admin">
              {ADMIN_MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return <NavLink key={item.to} to={item.to} className={mobileNavLinkClass}><Icon className="h-4 w-4" />{item.label}</NavLink>;
              })}
            </MobileSection>
          ) : null}
          <MobileSection>
            <NavLink to="/suggest" className={mobileNavLinkClass}>
              <MessageSquare className="h-4 w-4" />
              Suggest a venue
            </NavLink>
            <button type="button" className={mobileNavLinkClass({ isActive: false })} onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </MobileSection>
        </nav>
      </Sheet>
    </>
  );
}
