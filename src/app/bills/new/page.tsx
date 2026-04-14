import { BillIntakeFlow } from "@/components/keel/bill-intake-flow";
import { AppShell } from "@/components/keel/primitives";

export default function NewBillPage() {
  return (
    <AppShell title="Add a bill" currentPath="/bills" backHref="/bills">
      <BillIntakeFlow />
    </AppShell>
  );
}
