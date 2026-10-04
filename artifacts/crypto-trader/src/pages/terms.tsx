import { Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";

const sections = [
  {
    title: "1. Using NexusTrade",
    paragraphs: [
      "NexusTrade provides a trading terminal for viewing market information, analyzing instruments, managing watchlists, and connecting supported broker accounts. You must be at least 18 years old and provide accurate account information.",
      "You are responsible for keeping your password and broker connections secure. Do not share your account or use the service on behalf of another person without authorization.",
    ],
  },
  {
    title: "2. Broker accounts and orders",
    paragraphs: [
      "NexusTrade does not hold your funds or act as your broker. Orders are routed to the broker account you connect, subject to that broker's terms, availability, and execution rules.",
      "You are solely responsible for reviewing orders, positions, account permissions, and trading settings before enabling or submitting them. Auto-trading features may place real orders when enabled. Disconnect a broker or disable a strategy when you no longer want orders submitted.",
    ],
  },
  {
    title: "3. Market information and AI predictions",
    paragraphs: [
      "Market data, charts, signals, and AI-generated predictions are provided for informational and educational purposes only. They are not investment, financial, tax, or legal advice and are not a guarantee of future results.",
      "Trading involves substantial risk, including the possible loss of all invested capital. You should independently evaluate every decision and consult a qualified professional for advice about your circumstances.",
    ],
  },
  {
    title: "4. User-supplied AI API keys",
    paragraphs: [
      "If you enter an Anthropic, OpenAI, Google Gemini, or other supported AI provider API key, you represent that you are authorized to use that key and that its use with NexusTrade is permitted by the provider's terms, account permissions, and applicable law.",
      "You are responsible for the key's account, usage, charges, quotas, rate limits, data settings, and activity. NexusTrade does not guarantee that a provider will accept the key, keep a provider available, or prevent provider charges. Review your provider account and revoke or replace the key promptly if you believe it has been exposed or misused.",
      "Do not enter another person's key, a key obtained unlawfully, or a key that grants permissions beyond the AI services you intend to use. NexusTrade may reject, disable, or delete a key when necessary to protect the service, your account, or other users.",
    ],
  },
  {
    title: "5. Acceptable use",
    paragraphs: [
      "You may not misuse the service, attempt to bypass security controls, interfere with its operation, access another user's account, upload malicious code, or use NexusTrade for unlawful activity.",
      "We may suspend or terminate access when we reasonably believe these terms have been violated, the service is at risk, or continued access could cause harm.",
    ],
  },
  {
    title: "6. Availability and liability",
    paragraphs: [
      "The service is provided on an as-is and as-available basis. We do not guarantee uninterrupted access, error-free data, order execution, or compatibility with every broker or device.",
      "To the maximum extent permitted by law, NexusTrade and its providers are not liable for losses arising from market movements, broker outages, delayed or rejected orders, inaccurate data, unauthorized access caused by your failure to secure your account, or reliance on AI-generated content.",
    ],
  },
  {
    title: "7. Changes and contact",
    paragraphs: [
      "We may update these terms as the service changes. Continued use after an update means you accept the revised terms. The date below identifies the current version.",
      "For questions about these terms, contact the support address provided in your NexusTrade account communications.",
    ],
  },
];

export default function Terms() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10 md:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/login">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
            Back to NexusTrade
          </span>
        </Link>

        <header className="mt-12 border-b border-border pb-8">
          <div className="flex items-center gap-3 text-primary">
            <FileText className="h-7 w-7" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em]">
              NexusTrade
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            Terms and Conditions
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: October 1, 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            These terms explain the rules for using NexusTrade and the
            responsibilities that come with connecting a broker account or
            enabling trading features.
          </p>
        </header>

        <div className="divide-y divide-border">
          {sections.map((section) => (
            <section key={section.title} className="py-8">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <div className="mt-4 space-y-4 text-muted-foreground leading-7">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="border-t border-border pt-8 text-sm text-muted-foreground">
          By creating or using a NexusTrade account, you acknowledge that you
          have read and agree to these Terms and Conditions.
        </footer>
      </div>
    </main>
  );
}
