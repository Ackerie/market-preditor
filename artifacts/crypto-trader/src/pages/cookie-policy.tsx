import { Link } from "wouter";
import { ArrowLeft, Cookie } from "lucide-react";

export default function CookiePolicy() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground md:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/login">
          <span className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to NexusTrade
          </span>
        </Link>
        <header className="mt-12 border-b border-border pb-8">
          <div className="flex items-center gap-3 text-primary">
            <Cookie className="h-7 w-7" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em]">
              NexusTrade
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            Cookie Policy
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: October 1, 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            This policy explains the small amount of cookie and browser storage
            NexusTrade uses to provide a secure trading terminal.
          </p>
        </header>
        <div className="divide-y divide-border">
          <section className="py-8">
            <h2 className="text-xl font-semibold">What we use</h2>
            <div className="mt-4 space-y-4 leading-7 text-muted-foreground">
              <p>
                Authentication cookies keep your session active and help protect
                access to your account.
              </p>
              <p>
                A preference cookie remembers whether the application sidebar is
                open or closed on your device.
              </p>
              <p>
                Browser storage remembers that you have dismissed the cookie
                notice, so it does not appear on every visit.
              </p>
            </div>
          </section>
          <section className="py-8">
            <h2 className="text-xl font-semibold">What we do not use</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              NexusTrade does not currently use advertising cookies, cross-site
              tracking pixels, or analytics cookies. We do not sell
              cookie-derived information.
            </p>
          </section>
          <section className="py-8">
            <h2 className="text-xl font-semibold">Do you need to consent?</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              The storage described here is strictly necessary for account
              security, session management, and requested preferences. In many
              jurisdictions, consent is not required for strictly necessary
              cookies, but we provide notice so you can understand and control
              your browser settings. If NexusTrade adds optional cookies, we
              will update this policy and request consent where required.
            </p>
          </section>
          <section className="py-8">
            <h2 className="text-xl font-semibold">Managing cookies</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              You can block or delete cookies through your browser settings.
              Blocking essential cookies may prevent sign-in and other account
              features from working correctly.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
