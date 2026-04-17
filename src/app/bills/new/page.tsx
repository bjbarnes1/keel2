import { BillIntakeFlow } from "@/components/keel/bill-intake-flow";
import { AppShell } from "@/components/keel/primitives";
import { getCategoryOptions, getDashboardSnapshot } from "@/lib/persistence/keel-store";

export default async function NewBillPage() {
  const snapshot = await getDashboardSnapshot();
  const categories = await getCategoryOptions();

  return (
    <AppShell title="Add a bill" currentPath="/bills" backHref="/bills">
      <BillIntakeFlow
        incomes={snapshot.incomes}
        primaryIncomeId={snapshot.primaryIncomeId}
        categories={categories}
      />
    </AppShell>
  );
}
