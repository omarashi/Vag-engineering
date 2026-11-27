import { Prisma } from "@prisma/client";
import { db } from "./db";
import { interval, type Filters } from "./views";
import { cents, extended, units } from "./rules";
import { workshopCharges, workshopImports } from "./workshop-charges";
import { invoiceSettlements } from "./invoice-settlement";

const displayRecord = {
  id: true, number: true, at: true, status: true, total: true,
  party: { select: { id: true, name: true } }, vehicle: { select: { id: true, make: true, model: true, color: true, plate: true } },
} satisfies Prisma.DocumentSelect;

const searchRecord = (like: { contains: string; mode: "insensitive" }): Prisma.DocumentWhereInput[] => [
  { number: like }, { title: like }, { party: { name: like } },
  { vehicle: { OR: [{ make: like }, { model: like }, { plate: like }] } }, { source: { number: like } },
];

function selectReportLines(kind: "imports" | "electrical", filters: Filters) {
  const term = filters.q?.trim();
  const like = term ? { contains: term, mode: "insensitive" as const } : undefined;
  return db.line.findMany({ where: {
    purpose: { in: kind === "imports" ? ["importedItem"] : ["electricalWork", "electricalLabor"] },
    supplierId: kind === "imports" ? filters.party || undefined : undefined,
    document: { kind: "invoice", status: { in: ["posted", "reversed"] }, at: interval(filters),
      partyId: kind === "electrical" ? filters.party || undefined : undefined, vehicleId: filters.vehicle || undefined },
    ...(like && { OR: [ ...(kind === "imports" ? [{ description: like }, { supplierName: like }] : []), { document: { OR: searchRecord(like) } }] }),
  }, select: {
    id: true, purpose: true, description: true, quantity: true, price: true, buyingPrice: true, total: true, costTotal: true, supplierId: true, supplierName: true,
    document: { select: { ...displayRecord, source: { select: { id: true, number: true } }, related: {
      where: { kind: "credit", status: "posted", lines: { none: {} } }, select: { total: true },
    } } },
    related: { where: { document: { kind: "credit", status: "posted" } }, select: { total: true } },
  }, orderBy: [{ document: { at: "desc" } }, { documentId: "desc" }, { position: "asc" }] });
}

function netLine(line: Awaited<ReturnType<typeof selectReportLines>>[number]) {
  return line.document.status === "posted" ? line.total - line.related.reduce((sum, credit) => sum + credit.total, 0n) : 0n;
}

export async function importReport(filters: Filters) {
  const [invoiced, jobs] = await Promise.all([
    selectReportLines("imports", filters),
    db.document.findMany({ where: { kind: { in: ["job", "visit"] }, at: interval(filters),
      metadata: { path: ["importRequested"], equals: true }, related: { none: { kind: "invoice", status: "posted" } } },
      select: { ...displayRecord, title: true, metadata: true } }),
  ]);
  const term = filters.q?.trim().toLowerCase();
  const draft = jobs.flatMap((job) => workshopImports(job.metadata).flatMap((item, index) => {
    if (filters.party && item.supplierId !== filters.party) return [];
    if (term && ![item.name, item.supplierName, job.number, job.title, job.party?.name,
      job.vehicle?.model, job.vehicle?.plate].some((value) => value?.toLowerCase().includes(term))) return [];
    const quantity = units(item.quantity);
    const price = cents(item.sellingPrice);
    return [{ id: job.id + "-" + index, at: job.at, name: item.name, quantity: quantity.toFixed(), price, buyingPrice: cents(item.buyingPrice),
      cost: extended(quantity, cents(item.buyingPrice)), revenue: 0n, planned: job.status === "cancelled" ? 0n : extended(quantity, price),
      supplierId: item.supplierId, supplier: item.supplierName, job, invoice: null, party: job.party, vehicle: job.vehicle,
      status: job.status === "cancelled" ? "cancelled" : "Recorded" }];
  }));
  const sold = invoiced.map((line) => ({
    id: line.id, at: line.document.at, name: line.description, quantity: line.quantity.toFixed(), price: line.price,
    buyingPrice: line.buyingPrice ?? 0n, cost: line.document.status === "posted" ? line.costTotal : 0n, revenue: netLine(line), planned: 0n,
    supplierId: line.supplierId, supplier: line.supplierName, job: line.document.source, invoice: line.document, party: line.document.party, vehicle: line.document.vehicle,
    status: line.document.status === "reversed" ? "reversed" : line.related.length ? "Credited" : "Sold",
  }));
  const rows = [...sold, ...draft].sort((left, right) => right.at.getTime() - left.at.getTime() || left.id.localeCompare(right.id));
  const totals = { planned: 0n, revenue: 0n, cost: 0n };
  const supplierTotals = new Map<string | null, typeof totals>();
  for (const row of rows) {
    const supplier = supplierTotals.get(row.supplierId) ?? { planned: 0n, revenue: 0n, cost: 0n };
    const soldCost = row.invoice ? row.cost : 0n;
    supplier.planned += row.planned;
    supplier.revenue += row.revenue;
    supplier.cost += soldCost;
    supplierTotals.set(row.supplierId, supplier);
    totals.planned += row.planned;
    totals.revenue += row.revenue;
    totals.cost += soldCost;
  }
  const unassigned = new Map(invoiced.filter(({ document }) => document.status === "posted").map(({ document }) =>
    [document.id, document.related.reduce((sum, credit) => sum + credit.total, 0n)]));
  return { rows, ...totals, profit: totals.revenue - totals.cost, supplierTotals,
    unassignedCredits: [...unassigned.values()].reduce((sum, total) => sum + total, 0n) };
}

export async function electricalReport(filters: Filters) {
  const like = filters.q ? { contains: filters.q, mode: "insensitive" as const } : undefined;
  const [lines, jobs] = await Promise.all([
    selectReportLines("electrical", filters),
    db.document.findMany({ where: { kind: { in: ["job", "visit"] }, status: { not: "cancelled" },
      at: interval(filters), partyId: filters.party || undefined, vehicleId: filters.vehicle || undefined,
      related: { none: { kind: "invoice", status: "posted" } },
      AND: [
        { OR: ["electricalWork", "electricalLabor"].map((type) => ({ metadata: { path: ["workshopCharges", type], not: Prisma.AnyNull } })) },
        ...(like ? [{ OR: searchRecord(like) }] : []),
      ],
    }, select: { ...displayRecord, metadata: true }, orderBy: [{ at: "desc" }, { id: "desc" }] }),
  ]);
  const grouped = new Map<string, { invoice: typeof lines[number]["document"]; work: bigint; labor: bigint }>();
  for (const line of lines) {
    const row = grouped.get(line.document.id) ?? { invoice: line.document, work: 0n, labor: 0n };
    if (line.purpose === "electricalWork") row.work += netLine(line);
    else row.labor += netLine(line);
    grouped.set(line.document.id, row);
  }
  const posted = [...grouped.values()].filter(({ invoice }) => invoice.status === "posted");
  const balances = await invoiceSettlements(posted.map(({ invoice }) => invoice));
  const rows = [...grouped.values()].map((row) => ({ ...row, settlement: balances.get(row.invoice.id) }));
  const work = rows.reduce((sum, row) => sum + row.work, 0n);
  const labor = rows.reduce((sum, row) => sum + row.labor, 0n);
  const pending = jobs.flatMap((job) => {
    const charges = workshopCharges(job.metadata);
    return charges.electricalWork || charges.electricalLabor ? [{ job, work: cents(charges.electricalWork), labor: cents(charges.electricalLabor) }] : [];
  });
  return { rows, pending, work, labor, total: work + labor, unassignedCredits: posted.reduce((sum, { invoice }) =>
    sum + invoice.related.reduce((credits, row) => credits + row.total, 0n), 0n) };
}
