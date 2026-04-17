import {
  createCategoryAction,
  createSubcategoryAction,
  deleteCategoryAction,
  deleteSubcategoryAction,
} from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { getCategoryOptions } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SettingsCategoriesPage() {
  const categories = await getCategoryOptions();

  return (
    <AppShell title="Categories" currentPath="/settings" backHref="/settings">
      <SurfaceCard className="space-y-3">
        <p className="text-sm font-medium">Add a category</p>
        <form action={createCategoryAction} className="space-y-3">
          <input
            name="name"
            placeholder="e.g. Medical"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none"
          />
          <SubmitButton label="Add category" pendingLabel="Adding…" />
        </form>
      </SurfaceCard>

      <div className="mt-4 space-y-3">
        {categories.map((category) => (
          <SurfaceCard key={category.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{category.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {category.subcategories.length} subcategories
                </p>
              </div>
              <form action={deleteCategoryAction}>
                <input type="hidden" name="categoryId" value={category.id} />
                <SubmitButton
                  label="Delete"
                  pendingLabel="Deleting…"
                  variant="outline"
                  className="w-auto rounded-xl px-3 py-2 text-xs"
                />
              </form>
            </div>

            {category.subcategories.length ? (
              <div className="space-y-2">
                {category.subcategories.map((subcategory) => (
                  <div
                    key={subcategory.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <p className="text-sm">{subcategory.name}</p>
                    <form action={deleteSubcategoryAction}>
                      <input type="hidden" name="subcategoryId" value={subcategory.id} />
                      <SubmitButton
                        label="Remove"
                        pendingLabel="Removing…"
                        variant="outline"
                        className="w-auto rounded-xl px-3 py-2 text-xs"
                      />
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No subcategories yet.</p>
            )}

            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="text-sm font-medium">Add a subcategory</p>
              <form action={createSubcategoryAction} className="mt-2 space-y-3">
                <input type="hidden" name="categoryId" value={category.id} />
                <input
                  name="name"
                  placeholder={`e.g. ${category.name === "Medical" ? "Dental" : "Sub-item"}`}
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none"
                />
                <SubmitButton label="Add subcategory" pendingLabel="Adding…" />
              </form>
            </div>
          </SurfaceCard>
        ))}
      </div>
    </AppShell>
  );
}

