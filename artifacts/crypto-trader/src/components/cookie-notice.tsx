import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOKIE_NOTICE_KEY = "nexustrade-cookie-notice-seen";

export function CookieNotice() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(window.localStorage.getItem(COOKIE_NOTICE_KEY) !== "true");
  }, []);

  function dismiss() {
    window.localStorage.setItem(COOKIE_NOTICE_KEY, "true");
    setIsVisible(false);
  }

  if (!isVisible) return null;

  return (
    <aside
      role="status"
      aria-label="Cookie notice"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-lg border border-border bg-card p-4 text-card-foreground shadow-2xl md:inset-x-auto md:right-6 md:w-[min(100%-3rem,42rem)]"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Essential cookies only</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            NexusTrade uses essential cookies and browser storage to keep you
            signed in, protect your account, and remember preferences. We do not
            use advertising or analytics cookies.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={dismiss}>
              Understood
            </Button>
            <Link href="/cookies">
              <span className="cursor-pointer text-sm text-primary hover:underline">
                Read Cookie Policy
              </span>
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
