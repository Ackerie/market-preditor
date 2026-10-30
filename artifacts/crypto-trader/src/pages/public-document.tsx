import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

interface PublicDocumentProps {
  title: string;
  documentPath: string;
}

export default function PublicDocument({
  title,
  documentPath,
}: PublicDocumentProps) {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/login">
          <span className="mb-4 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to NexusTrade
          </span>
        </Link>
        <iframe
          className="h-[85vh] min-h-[640px] w-full rounded-lg border border-border bg-background"
          src={documentPath}
          title={title}
        />
      </div>
    </main>
  );
}
