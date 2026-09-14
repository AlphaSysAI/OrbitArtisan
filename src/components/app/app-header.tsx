"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Shield } from "lucide-react";

import {
  APP_NAV_MORE,
  APP_NAV_PRIMARY,
  isNavItemActive,
  isNavMoreActive,
} from "@/components/app/nav-items";
import { InviteSomeoneDialog } from "@/components/invitations/invite-someone-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

function NavLink({
  item,
  active,
  compact,
}: {
  item: (typeof APP_NAV_PRIMARY)[number];
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "shrink-0 rounded-xl px-2 py-2 text-sm font-semibold transition-colors lg:px-2.5 xl:px-3",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="xl:hidden">{compact ? item.shortLabel : item.label}</span>
      <span className="hidden xl:inline">{item.label}</span>
    </Link>
  );
}

export function AppHeader({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  const moreActive = isNavMoreActive(pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link href="/app" className="group flex shrink-0 items-center gap-2.5 sm:gap-3">
          <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-[1.03] sm:size-10">
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">O</span>
            <span className="absolute inset-x-0 bottom-0 h-1 bg-brand" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="font-display truncate text-base font-semibold tracking-tight">Soline</p>
            <p className="text-xs text-muted-foreground">Espace pro</p>
          </div>
        </Link>

        <nav
          className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden lg:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Navigation principale"
        >
          {APP_NAV_PRIMARY.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isNavItemActive(pathname, item)}
              compact
            />
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors outline-none lg:px-2.5 xl:px-3",
                moreActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Plus
              <ChevronDown className="size-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {APP_NAV_MORE.map((item) => {
                const Icon = item.icon;
                const active = isNavItemActive(pathname, item);
                return (
                  <DropdownMenuItem key={item.href} render={<Link href={item.href} />} className="gap-2">
                    <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
                    <span className={cn(active && "font-semibold text-primary")}>{item.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          {isPlatformAdmin ? (
            <Link
              href="/admin"
              title="Administration"
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-sm sm:font-semibold",
                pathname.startsWith("/admin")
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Shield className="size-4 shrink-0" />
              <span className="hidden 2xl:inline">Admin</span>
            </Link>
          ) : null}
          <div className="hidden md:block">
            <InviteSomeoneDialog
              contextLabel="Je"
              canLinkClientToArtisan
              size="default"
              className="min-h-9 px-2.5 text-sm xl:min-h-10 xl:px-3"
            />
          </div>
          <ThemeToggle />
          <form action={signOut} className="hidden md:block">
            <Button
              variant="outline"
              size="default"
              type="submit"
              title="Quitter"
              className="min-h-9 gap-2 px-2.5 text-muted-foreground xl:min-h-10 xl:px-3"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="hidden 2xl:inline">Quitter</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
