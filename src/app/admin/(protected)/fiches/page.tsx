import Link from "next/link";

import { AppPageHeader } from "@/components/app/app-page-header";
import { TechnicalSheetReviewControls } from "@/components/admin/technical-sheet-review-controls";
import { Badge } from "@/components/ui/badge";
import { getAdminDb } from "@/lib/admin/db";
import { sheetTradesLabel } from "@/lib/technical-sheets/catalog";
import { loadSheetReviews } from "@/lib/technical-sheets/data";
import { CLIENT_SHEET_LIBRARY } from "@/lib/technical-sheets/client/library";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";

type ReviewMap = Awaited<ReturnType<typeof loadSheetReviews>>;

function ReviewList({ sheets, reviews }: { sheets: { id: string; title: string; meta: string }[]; reviews: ReviewMap }) {
  return (
    <ul className="divide-y rounded-2xl border bg-card shadow-sm">
      {sheets.map((sheet) => {
        const review = reviews.get(sheet.id);
        return (
          <li key={sheet.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">
                <Link href={`/admin/fiches/${sheet.id}`} className="hover:underline">
                  {sheet.title}
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {sheet.meta} · <code>{sheet.id}</code>
              </p>
              {review ? (
                <p className="text-xs text-muted-foreground">
                  {review.reviewerName ? `${review.reviewerName} · ` : ""}
                  {new Date(review.reviewedAt).toLocaleDateString("fr-FR")}
                  {review.note ? ` · ${review.note}` : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {review?.status === "verified" ? (
                <Badge>Vérifiée</Badge>
              ) : review?.status === "needs_changes" ? (
                <Badge variant="destructive">À corriger</Badge>
              ) : (
                <Badge variant="secondary">En relecture</Badge>
              )}
              <TechnicalSheetReviewControls
                sheetId={sheet.id}
                status={review?.status ?? null}
                reviewerName={review?.reviewerName ?? null}
                note={review?.note ?? null}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type AiRequestRow = { id: string; request: string; title: string; trade_id: string | null; created_at: string };

export default async function AdminTechnicalSheetsPage() {
  const db = getAdminDb();
  const [reviews, aiRes] = db
    ? await Promise.all([
        loadSheetReviews(db),
        db
          .from("technical_sheets_ai")
          .select("id, request, title, trade_id, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ])
    : [new Map() as ReviewMap, { data: [] }];
  const aiRequests = (aiRes.data ?? []) as AiRequestRow[];

  const verified = TECHNICAL_SHEET_LIBRARY.filter((s) => reviews.get(s.id)?.status === "verified").length;
  const toFix = TECHNICAL_SHEET_LIBRARY.filter((s) => reviews.get(s.id)?.status === "needs_changes").length;

  return (
    <div className="space-y-8">
      <AppPageHeader
        title="Fiches techniques"
        description={`${TECHNICAL_SHEET_LIBRARY.length} fiches dans la bibliothèque · ${verified} vérifiées · ${toFix} à corriger · ${
          TECHNICAL_SHEET_LIBRARY.length - verified - toFix
        } en relecture. Une fiche « à corriger » est retirée de l'app jusqu'à sa correction dans le code.`}
      />

      <ReviewList sheets={TECHNICAL_SHEET_LIBRARY.map((s) => ({ id: s.id, title: s.title, meta: sheetTradesLabel(s) }))} reviews={reviews} />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Fiches dépannage particuliers ({CLIENT_SHEET_LIBRARY.length})</h2>
        <p className="text-sm text-muted-foreground">
          Affichées dans l&apos;espace client. Tant qu&apos;elles ne sont pas vérifiées, elles portent la mention « Fiche SolineBTP ».
        </p>
        <ReviewList
          sheets={CLIENT_SHEET_LIBRARY.map((s) => ({ id: s.id, title: s.title, meta: `Dépannage · ${s.level}` }))}
          reviews={reviews}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Dernières fiches demandées à l&apos;IA</h2>
        <p className="text-sm text-muted-foreground">
          Les sujets que la bibliothèque ne couvre pas encore : de bons candidats pour les prochaines fiches relues.
        </p>
        {aiRequests.length > 0 ? (
          <ul className="divide-y rounded-2xl border bg-card shadow-sm">
            {aiRequests.map((row) => (
              <li key={row.id} className="p-4 text-sm">
                <p className="font-medium">{row.title}</p>
                <p className="text-muted-foreground">
                  « {row.request} » · {row.trade_id ?? "métier non renseigné"} · {new Date(row.created_at).toLocaleDateString("fr-FR")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune demande pour l&apos;instant.</p>
        )}
      </section>
    </div>
  );
}
