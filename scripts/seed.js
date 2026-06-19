/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "airtable.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Schema (matches src/lib/db.ts — ensures a fresh schema on re-seed)
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS bases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_id INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 160,
    is_primary INTEGER NOT NULL DEFAULT 0,
    config TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    row_id INTEGER NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(row_id, column_id)
  );
  CREATE TABLE IF NOT EXISTS column_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(column_id, value)
  );
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    source_row_id INTEGER NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
    target_row_id INTEGER NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(link_column_id, source_row_id, target_row_id)
  );
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertBase(name) {
  return db.prepare("INSERT INTO bases (name) VALUES (?)").run(name).lastInsertRowid;
}

function insertTable(baseId, name) {
  return db.prepare("INSERT INTO tables (base_id, name) VALUES (?, ?)")
    .run(baseId, name).lastInsertRowid;
}

/**
 * Insert columns. Each entry: { name, type, width?, isPrimary?, config?, options? }
 * Returns an array of column ids in the same order.
 */
function insertColumns(tableId, columns) {
  const stmt = db.prepare(
    `INSERT INTO columns (table_id, name, type, width, is_primary, config, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const optStmt = db.prepare(
    "INSERT INTO column_options (column_id, value, color, sort_order) VALUES (?, ?, ?, ?)"
  );
  const ids = [];
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    const id = stmt.run(
      tableId,
      c.name,
      c.type,
      c.width ?? 160,
      c.isPrimary ? 1 : 0,
      c.config ? JSON.stringify(c.config) : null,
      i
    ).lastInsertRowid;
    ids.push(id);
    // Seed options for SELECT / MULTI_SELECT
    if ((c.type === "SELECT" || c.type === "MULTI_SELECT") && Array.isArray(c.options)) {
      for (let j = 0; j < c.options.length; j++) {
        const opt = c.options[j];
        const value = typeof opt === "string" ? opt : opt.value;
        const color = typeof opt === "string" ? null : (opt.color ?? null);
        optStmt.run(id, value, color, j);
      }
    }
  }
  return ids;
}

function insertRow(tableId, columnIds, values) {
  const rowId = db.prepare("INSERT INTO rows (table_id) VALUES (?)").run(tableId).lastInsertRowid;
  const stmt = db.prepare("INSERT INTO cells (row_id, column_id, value) VALUES (?, ?, ?)");
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null || values[i] === undefined) continue;
    stmt.run(rowId, columnIds[i], String(values[i]));
  }
  return rowId;
}

function insertLink(linkColumnId, sourceRowId, targetRowId) {
  db.prepare(
    "INSERT INTO links (link_column_id, source_row_id, target_row_id) VALUES (?, ?, ?)"
  ).run(linkColumnId, sourceRowId, targetRowId);
}

function clearData() {
  db.prepare("DELETE FROM links").run();
  db.prepare("DELETE FROM column_options").run();
  db.prepare("DELETE FROM cells").run();
  db.prepare("DELETE FROM rows").run();
  db.prepare("DELETE FROM columns").run();
  db.prepare("DELETE FROM tables").run();
  db.prepare("DELETE FROM bases").run();
  db.prepare(
    "DELETE FROM sqlite_sequence WHERE name IN ('bases', 'tables', 'columns', 'rows', 'cells', 'column_options', 'links')"
  ).run();
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seed() {
  clearData();

  // ===== Base 1: Product Catalog (with linked Suppliers) ===================
  const productBase = insertBase("Product Catalog");

  // --- Suppliers table (created first so we can link to it) ---
  const suppliersTable = insertTable(productBase, "Suppliers");
  const suppliersCols = insertColumns(suppliersTable, [
    { name: "Company", type: "TEXT", isPrimary: true, width: 180 },
    { name: "Contact", type: "TEXT", width: 160 },
    { name: "Country", type: "SELECT", width: 140, options: ["Taiwan", "Mexico", "Germany", "Vietnam", "China", "USA"] },
    { name: "Rating", type: "NUMBER", width: 100 },
    { name: "Active", type: "CHECKBOX", width: 80 },
  ]);

  const suppliers = [
    ["TechSource Inc.", "Alice Chen", "Taiwan", 4.8, "1"],
    ["Global Components", "Bob Martinez", "Mexico", 4.5, "1"],
    ["Premium Audio", "Carol Smith", "Germany", 4.9, "1"],
    ["Comfort Furniture", "David Kim", "Vietnam", 4.2, "1"],
    ["Bright Lights", "Eva Johnson", "China", 3.9, "0"],
  ];
  const supplierRowIds = suppliers.map((row) => insertRow(suppliersTable, suppliersCols, row));

  // --- Products table with a LINK column to Suppliers ---
  const productsTable = insertTable(productBase, "Products");
  const productsCols = insertColumns(productsTable, [
    { name: "Name", type: "TEXT", isPrimary: true, width: 200 },
    { name: "SKU", type: "TEXT", width: 120 },
    { name: "Category", type: "SELECT", width: 140, options: [
      { value: "Electronics", color: "#3b82f6" },
      { value: "Accessories", color: "#10b981" },
      { value: "Audio", color: "#a855f7" },
      { value: "Furniture", color: "#f59e0b" },
    ] },
    { name: "Price", type: "NUMBER", width: 100 },
    { name: "In Stock", type: "CHECKBOX", width: 90 },
    { name: "Supplier", type: "LINK", width: 180, config: { targetTableId: suppliersTable } },
  ]);

  const products = [
    ["Wireless Mouse", "WM-001", "Electronics", 29.99, "1"],
    ["Mechanical Keyboard", "KB-002", "Electronics", 89.99, "1"],
    ["USB-C Hub", "HB-003", "Accessories", 49.99, "1"],
    ["27-inch Monitor", "MN-004", "Electronics", 329.99, "0"],
    ["Webcam 4K", "WC-005", "Electronics", 119.99, "1"],
    ["Laptop Stand", "LS-006", "Accessories", 39.99, "1"],
    ["Noise Cancelling Headphones", "HP-007", "Audio", 199.99, "1"],
    ["Desk Lamp", "DL-008", "Furniture", 34.99, "1"],
    ["Ergonomic Chair", "CH-009", "Furniture", 499.99, "0"],
    ["Standing Desk", "SD-010", "Furniture", 699.99, "1"],
  ];
  // supplierIndex maps each product to a supplier row
  const supplierIndex = [0, 0, 1, 1, 0, 1, 2, 3, 3, 3];
  const productRowIds = products.map((row, i) => {
    const rowId = insertRow(productsTable, productsCols, row);
    // Create the link: productsCols[5] is the Supplier LINK column
    insertLink(productsCols[5], rowId, supplierRowIds[supplierIndex[i]]);
    return rowId;
  });
  void productRowIds;

  // Add a LOOKUP column: pull Supplier's Country into Products
  db.prepare(
    `INSERT INTO columns (table_id, name, type, width, is_primary, config, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    productsTable,
    "Supplier Country",
    "LOOKUP",
    160,
    0,
    JSON.stringify({ linkColumnId: productsCols[5], targetColumnId: suppliersCols[2] }),
    6
  );

  // Add a ROLLUP column: average Rating of linked Supplier
  db.prepare(
    `INSERT INTO columns (table_id, name, type, width, is_primary, config, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    productsTable,
    "Supplier Rating",
    "ROLLUP",
    140,
    0,
    JSON.stringify({ linkColumnId: productsCols[5], targetColumnId: suppliersCols[3], aggregation: "avg" }),
    7
  );

  // ===== Base 2: Project Tracker (with linked Tasks <-> Milestones) ========
  const projectBase = insertBase("Project Tracker");

  // --- Milestones table ---
  const milestonesTable = insertTable(projectBase, "Milestones");
  const milestonesCols = insertColumns(milestonesTable, [
    { name: "Name", type: "TEXT", isPrimary: true, width: 180 },
    { name: "Target Date", type: "DATE", width: 140 },
    { name: "Progress", type: "NUMBER", width: 100 },
    { name: "Owner", type: "TEXT", width: 140 },
    { name: "Status", type: "SELECT", width: 130, options: [
      { value: "Complete", color: "#10b981" },
      { value: "On Track", color: "#3b82f6" },
      { value: "At Risk", color: "#f59e0b" },
      { value: "Delayed", color: "#ef4444" },
    ] },
  ]);

  const milestones = [
    ["Q1 Planning", "2026-01-31", 100, "Sarah Lee", "Complete"],
    ["Alpha Release", "2026-03-15", 85, "Mike Ross", "On Track"],
    ["Beta Launch", "2026-05-01", 45, "Jenny Wu", "At Risk"],
    ["Public Launch", "2026-06-15", 20, "Tom Ford", "On Track"],
  ];
  const milestoneRowIds = milestones.map((row) => insertRow(milestonesTable, milestonesCols, row));

  // --- Tasks table with LINK to Milestones ---
  const tasksTable = insertTable(projectBase, "Tasks");
  const tasksCols = insertColumns(tasksTable, [
    { name: "Title", type: "TEXT", isPrimary: true, width: 220 },
    { name: "Assignee", type: "TEXT", width: 140 },
    { name: "Status", type: "SELECT", width: 140, options: [
      { value: "Todo", color: "#6b7280" },
      { value: "In Progress", color: "#3b82f6" },
      { value: "Done", color: "#10b981" },
    ] },
    { name: "Priority", type: "SELECT", width: 110, options: [
      { value: "Low", color: "#6b7280" },
      { value: "Medium", color: "#f59e0b" },
      { value: "High", color: "#ef4444" },
    ] },
    { name: "Hours", type: "NUMBER", width: 90 },
    { name: "Milestone", type: "LINK", width: 180, config: { targetTableId: milestonesTable } },
  ]);

  const tasks = [
    ["Design system audit", "Sarah Lee", "In Progress", "Medium", 12],
    ["API migration", "Mike Ross", "Done", "High", 24],
    ["Onboarding flow", "Jenny Wu", "Todo", "Low", 8],
    ["Payment integration", "Tom Ford", "In Progress", "High", 16],
    ["Accessibility review", "Lisa Ray", "Todo", "Medium", 10],
    ["Performance tuning", "Nick Park", "Done", "Medium", 14],
    ["Mobile responsiveness", "Emma Stone", "In Progress", "Low", 6],
    ["User research synthesis", "Ryan Grey", "Done", "Medium", 11],
    ["Release notes", "Olivia Brown", "Todo", "Low", 4],
    ["Bug bash", "Chris Evans", "In Progress", "High", 18],
    ["Analytics dashboard", "Sophia Green", "Todo", "Medium", 20],
    ["Security audit", "Daniel Craig", "Done", "High", 22],
  ];
  // Map each task to a milestone (by index into milestoneRowIds)
  const taskMilestoneIndex = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3];
  tasks.map((row, i) => {
    const rowId = insertRow(tasksTable, tasksCols, row);
    insertLink(tasksCols[5], rowId, milestoneRowIds[taskMilestoneIndex[i]]);
    return rowId;
  });

  // ===== Base 3: Sales CRM (with linked Leads <-> Deals) ===================
  const crmBase = insertBase("Sales CRM");

  // --- Leads table ---
  const leadsTable = insertTable(crmBase, "Leads");
  const leadsCols = insertColumns(leadsTable, [
    { name: "Lead Name", type: "TEXT", isPrimary: true, width: 160 },
    { name: "Email", type: "EMAIL", width: 200 },
    { name: "Company", type: "TEXT", width: 160 },
    { name: "Score", type: "NUMBER", width: 90 },
    { name: "Stage", type: "SELECT", width: 140, options: [
      { value: "New", color: "#6b7280" },
      { value: "Nurture", color: "#a855f7" },
      { value: "Qualified", color: "#3b82f6" },
      { value: "Negotiation", color: "#f59e0b" },
      { value: "Closed Won", color: "#10b981" },
    ] },
  ]);

  const leads = [
    ["John Smith", "john@acme.com", "Acme Corp", 85, "Qualified"],
    ["Jane Doe", "jane@startup.io", "Startup.io", 72, "New"],
    ["Robert Brown", "rb@enterprise.com", "Enterprise Ltd", 91, "Negotiation"],
    ["Emily Davis", "emily@techco.com", "TechCo", 68, "Qualified"],
    ["Michael Wilson", "mike@global.com", "Global Solutions", 55, "New"],
    ["Sarah Miller", "sarah@innovate.com", "Innovate Inc", 79, "Qualified"],
    ["David Garcia", "david@future.com", "Future Labs", 44, "Nurture"],
    ["Laura Martinez", "laura@digital.com", "Digital Agency", 88, "Negotiation"],
    ["James Anderson", "james@next.com", "NextGen", 63, "New"],
    ["Linda Thomas", "linda@cloud.com", "CloudFirst", 95, "Closed Won"],
  ];
  const leadRowIds = leads.map((row) => insertRow(leadsTable, leadsCols, row));

  // --- Deals table with LINK to Leads ---
  const dealsTable = insertTable(crmBase, "Deals");
  const dealsCols = insertColumns(dealsTable, [
    { name: "Deal Name", type: "TEXT", isPrimary: true, width: 180 },
    { name: "Value", type: "NUMBER", width: 120 },
    { name: "Probability", type: "NUMBER", width: 120 },
    { name: "Owner", type: "TEXT", width: 140 },
    { name: "Status", type: "SELECT", width: 140, options: [
      { value: "New", color: "#6b7280" },
      { value: "Qualification", color: "#a855f7" },
      { value: "Demo", color: "#3b82f6" },
      { value: "Proposal", color: "#f59e0b" },
      { value: "Negotiation", color: "#f59e0b" },
      { value: "Closed Won", color: "#10b981" },
    ] },
    { name: "Lead", type: "LINK", width: 160, config: { targetTableId: leadsTable } },
  ]);

  const deals = [
    ["Acme Renewal", 50000, 90, "John Smith", "Negotiation"],
    ["Startup.io Pilot", 12000, 75, "Jane Doe", "Proposal"],
    ["Enterprise License", 250000, 60, "Robert Brown", "Demo"],
    ["TechCo Expansion", 45000, 80, "Emily Davis", "Proposal"],
    ["Global Solutions Deal", 80000, 40, "Michael Wilson", "Qualification"],
    ["Innovate Inc Close", 30000, 95, "Sarah Miller", "Closed Won"],
    ["Future Labs Trial", 15000, 30, "David Garcia", "New"],
    ["Digital Agency Retainer", 60000, 85, "Laura Martinez", "Negotiation"],
  ];
  // Map each deal to a lead (by index)
  const dealLeadIndex = [0, 1, 2, 3, 4, 5, 6, 7];
  deals.map((row, i) => {
    const rowId = insertRow(dealsTable, dealsCols, row);
    insertLink(dealsCols[5], rowId, leadRowIds[dealLeadIndex[i]]);
    return rowId;
  });

  // Add a ROLLUP: total deal value per lead (reverse direction is not modeled
  // in this MVP, but the forward LOOKUP/ROLLUP from Deals->Leads works).
  // Add a LOOKUP on Deals: Lead's Company
  db.prepare(
    `INSERT INTO columns (table_id, name, type, width, is_primary, config, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dealsTable,
    "Lead Company",
    "LOOKUP",
    160,
    0,
    JSON.stringify({ linkColumnId: dealsCols[5], targetColumnId: leadsCols[2] }),
    6
  );

  // ===== Summary ===========================================================
  console.log("Seeded database successfully.");
  console.log("Bases:", db.prepare("SELECT COUNT(*) AS count FROM bases").get().count);
  console.log("Tables:", db.prepare("SELECT COUNT(*) AS count FROM tables").get().count);
  console.log("Columns:", db.prepare("SELECT COUNT(*) AS count FROM columns").get().count);
  console.log("Rows:", db.prepare("SELECT COUNT(*) AS count FROM rows").get().count);
  console.log("Cells:", db.prepare("SELECT COUNT(*) AS count FROM cells").get().count);
  console.log("Options:", db.prepare("SELECT COUNT(*) AS count FROM column_options").get().count);
  console.log("Links:", db.prepare("SELECT COUNT(*) AS count FROM links").get().count);
}

seed();
db.close();
