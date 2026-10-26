import { TradeSelect } from "@/components/settings/trade-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { saveOnboardingTradeStep } from "./actions";

export function OnboardingTradeStep({
  error,
  initialCategoryId,
  initialTradeId,
}: {
  error: string | null;
  initialCategoryId: string | null;
  initialTradeId: string | null;
}) {
  return (
    <form action={saveOnboardingTradeStep} className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <TradeSelect initialCategoryId={initialCategoryId} initialTradeId={initialTradeId} required />
      <Button type="submit" size="lg" className="w-full">
        Continuer
      </Button>
    </form>
  );
}
