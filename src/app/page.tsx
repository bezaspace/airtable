import { AppSidebar } from "@/components/app-sidebar";
import { TableGrid } from "@/components/table-grid";
import { listBases, listTables, getTableData } from "@/lib/queries";

interface PageProps {
  searchParams: Promise<{ base?: string; table?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const bases = await listBases();

  const tablesByBase: Record<number, Awaited<ReturnType<typeof listTables>>> = {};
  for (const base of bases) {
    tablesByBase[base.id] = await listTables(base.id);
  }

  let selectedBaseId: number | null = params.base ? Number(params.base) : null;
  let selectedTableId: number | null = params.table ? Number(params.table) : null;

  const validBaseIds = new Set(bases.map((b) => b.id));
  const selectedBaseExists = selectedBaseId ? validBaseIds.has(selectedBaseId) : false;
  const selectedTableExists = selectedBaseExists
    ? tablesByBase[selectedBaseId!]?.some((t) => t.id === selectedTableId)
    : false;

  if (!selectedBaseExists || !selectedTableExists) {
    const firstBase = bases[0];
    if (firstBase) {
      selectedBaseId = firstBase.id;
      const firstTable = tablesByBase[firstBase.id]?.[0];
      selectedTableId = firstTable ? firstTable.id : null;
    } else {
      selectedBaseId = null;
      selectedTableId = null;
    }
  }

  const selectedTableData = selectedTableId ? await getTableData(selectedTableId) : null;

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <AppSidebar
        bases={bases}
        initialTables={tablesByBase}
        selectedBaseId={selectedBaseId}
        selectedTableId={selectedTableId}
      />
      <main className="flex-1 min-w-0 bg-background">
        {selectedTableData ? (
          <TableGrid key={selectedTableData.table.id} initialData={selectedTableData} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Welcome to your Airtable clone
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create a base and a table from the sidebar to start building your data.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
