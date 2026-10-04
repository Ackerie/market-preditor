import { Link } from "wouter";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const disclosures = [
  {
    title: "Trading risk",
    body: "Trading can result in partial or complete loss of money. Past performance, simulated results, technical indicators, model confidence, and target prices do not predict future results. Only risk money you can afford to lose.",
  },
  {
    title: "Broker execution",
    body: "NexusTrade is software that can connect to supported third-party broker accounts. A connected broker may reject, delay, partially fill, cancel, or otherwise handle an order according to its own rules, account permissions, market conditions, and agreements.",
  },
  {
    title: "Automated trading",
    body: "When enabled, automated features may submit real orders to an opted-in broker account without a separate confirmation for each order. Review the selected instruments, limits, risk settings, and broker permissions before enabling automation and monitor the account while it is enabled.",
  },
  {
    title: "Asset-specific risks",
    body: "Cryptoassets, stocks, forex, futures, commodities, CFDs, and other leveraged or derivative products have different risks, fees, trading hours, liquidity, margin, and eligibility rules. Leverage can magnify losses. Confirm that each product is available and appropriate for your account with the connected broker.",
  },
  {
    title: "AI and market information",
    body: "AI output and market information may be delayed, incomplete, inaccurate, or unavailable. The application does not guarantee that an analysis is correct, suitable for your circumstances, or based on every relevant fact. Treat every signal as unverified information and make your own decision.",
  },
  {
    title: "No legal or regulatory conclusion",
    body: "This disclosure describes product behavior and general risks. It is not investment, tax, legal, or regulatory advice, and it does not determine whether any person or service is registered, exempt, or permitted in a particular jurisdiction. Obtain professional advice about your circumstances and applicable U.S. or state requirements.",
  },
];

export default function TradingDisclosures() {
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
          <div className="flex items-center gap-3 text-amber-400">
            <AlertTriangle className="h-7 w-7" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em]">
              NexusTrade
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            Trading Risk Disclosures
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: October 1, 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Review these product and market-risk disclosures before connecting a
            broker or enabling automated trading.
          </p>
        </header>
        <div className="divide-y divide-border">
          {disclosures.map((disclosure) => (
            <section key={disclosure.title} className="py-8">
              <h2 className="text-xl font-semibold">{disclosure.title}</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                {disclosure.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
