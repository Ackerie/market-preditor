import { Link } from "wouter";
import { ArrowLeft, RotateCcw } from "lucide-react";

export default function RefundPolicy() {
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
            <RotateCcw className="h-7 w-7" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em]">
              NexusTrade
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            Refund Policy
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: October 1, 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            This policy describes refunds for NexusTrade products and services.
          </p>
        </header>
        <div className="divide-y divide-border">
          <section className="py-8">
            <h2 className="text-xl font-semibold">Current service</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              NexusTrade currently has no subscription, paid plan, or in-app
              purchase flow. Because we do not currently charge a service fee,
              there are no service purchases to refund.
            </p>
          </section>
          <section className="py-8">
            <h2 className="text-xl font-semibold">Future paid services</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              If paid features are introduced, the applicable price, billing
              terms, renewal rules, cancellation process, and refund eligibility
              will be shown before purchase and this policy will be updated. Any
              mandatory consumer refund rights will continue to apply.
            </p>
          </section>
          <section className="py-8">
            <h2 className="text-xl font-semibold">Broker transactions</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              NexusTrade does not refund losses, market movements, broker fees,
              commissions, spreads, rejected orders, or executed trades. Those
              matters are governed by the connected broker's terms. Review every
              order before submitting it, especially when auto-trading is
              enabled.
            </p>
          </section>
          <section className="py-8">
            <h2 className="text-xl font-semibold">Questions</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              For a billing question or future refund request, contact the
              support address provided in your NexusTrade account communications
              with the relevant transaction details.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
