import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/auth-web";
import {
  LayoutDashboard,
  ArrowRightLeft,
  TrendingUp,
  PieChart,
  History,
  BrainCircuit,
  List,
  Bot,
  BarChart2,
  Radio,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Market", href: "/market", icon: BarChart2 },
    { name: "Trade", href: "/trade", icon: ArrowRightLeft },
    { name: "Portfolio", href: "/portfolio", icon: PieChart },
    { name: "History", href: "/history", icon: History },
    { name: "Predictions", href: "/predictions", icon: BrainCircuit },
    { name: "Auto-Trade", href: "/auto-trade", icon: Bot },
    { name: "Day Trade", href: "/day-trade", icon: TrendingUp },
    { name: "Watchlist", href: "/watchlist", icon: List },
    { name: "Account", href: "/account", icon: User },
  ];

  const SidebarContent = () => (
    <>
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
            N
          </div>
          <span className="font-bold text-xl tracking-tight">NexusTrade</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.name}>
                <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-border space-y-1 mt-auto">
        {user && (
          <Link href="/account" onClick={() => setMobileMenuOpen(false)}>
            <div className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-muted transition-colors">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                {user.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt={`${user.firstName ?? user.email ?? "Trader"} profile photo`}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <User className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {user.firstName ?? user.email ?? "Trader"}
                </div>
              </div>
            </div>
          </Link>
        )}
        <button
          onClick={() => {
            logout();
            setMobileMenuOpen(false);
          }}
          className="w-full flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors rounded-md hover:bg-muted text-left"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
            N
          </div>
          <span className="font-bold text-xl tracking-tight">NexusTrade</span>
        </div>
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col h-full">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
