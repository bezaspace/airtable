const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "airtable.db");
const db = new Database(DB_PATH);

function insertBase(name) {
  return db.prepare("INSERT INTO bases (name) VALUES (?)").run(name).lastInsertRowid;
}

function insertTable(baseId, name) {
  return db.prepare("INSERT INTO tables (base_id, name) VALUES (?, ?)")
    .run(baseId, name).lastInsertRowid;
}

function insertColumns(tableId, columns) {
  const stmt = db.prepare(
    "INSERT INTO columns (table_id, name, type, sort_order) VALUES (?, ?, ?, ?)"
  );
  const ids = [];
  for (let i = 0; i < columns.length; i++) {
    const { name, type } = columns[i];
    ids.push(stmt.run(tableId, name, type, i).lastInsertRowid);
  }
  return ids;
}

function insertRow(tableId, columnIds, values) {
  const rowId = db.prepare("INSERT INTO rows (table_id) VALUES (?)").run(tableId).lastInsertRowid;
  const stmt = db.prepare("INSERT INTO cells (row_id, column_id, value) VALUES (?, ?, ?)");
  for (let i = 0; i < values.length; i++) {
    const value = values[i] === null || values[i] === undefined ? null : String(values[i]);
    stmt.run(rowId, columnIds[i], value);
  }
  return rowId;
}

function clearData() {
  db.prepare("DELETE FROM cells").run();
  db.prepare("DELETE FROM rows").run();
  db.prepare("DELETE FROM columns").run();
  db.prepare("DELETE FROM tables").run();
  db.prepare("DELETE FROM bases").run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('bases', 'tables', 'columns', 'rows', 'cells')").run();
}

function seed() {
  clearData();

  // Base 1: Product Catalog
  const productBase = insertBase("Product Catalog");
  const productsTable = insertTable(productBase, "Products");
  const productsCols = insertColumns(productsTable, [
    { name: "Name", type: "TEXT" },
    { name: "SKU", type: "TEXT" },
    { name: "Category", type: "TEXT" },
    { name: "Price", type: "NUMBER" },
    { name: "Stock", type: "NUMBER" },
  ]);

  const products = [
    ["Wireless Mouse", "WM-001", "Electronics", 29.99, 150],
    ["Mechanical Keyboard", "KB-002", "Electronics", 89.99, 75],
    ["USB-C Hub", "HB-003", "Accessories", 49.99, 200],
    ["27-inch Monitor", "MN-004", "Electronics", 329.99, 45],
    ["Webcam 4K", "WC-005", "Electronics", 119.99, 90],
    ["Laptop Stand", "LS-006", "Accessories", 39.99, 120],
    ["Noise Cancelling Headphones", "HP-007", "Audio", 199.99, 60],
    ["Desk Lamp", "DL-008", "Furniture", 34.99, 85],
    ["Ergonomic Chair", "CH-009", "Furniture", 499.99, 20],
    ["Standing Desk", "SD-010", "Furniture", 699.99, 15],
  ];
  products.forEach((row) => insertRow(productsTable, productsCols, row));

  const suppliersTable = insertTable(productBase, "Suppliers");
  const suppliersCols = insertColumns(suppliersTable, [
    { name: "Company", type: "TEXT" },
    { name: "Contact", type: "TEXT" },
    { name: "Country", type: "TEXT" },
    { name: "Rating", type: "NUMBER" },
    { name: "Active", type: "TEXT" },
  ]);

  const suppliers = [
    ["TechSource Inc.", "Alice Chen", "Taiwan", 4.8, "Yes"],
    ["Global Components", "Bob Martinez", "Mexico", 4.5, "Yes"],
    ["Premium Audio", "Carol Smith", "Germany", 4.9, "Yes"],
    ["Comfort Furniture", "David Kim", "Vietnam", 4.2, "Yes"],
    ["Bright Lights", "Eva Johnson", "China", 3.9, "No"],
  ];
  suppliers.forEach((row) => insertRow(suppliersTable, suppliersCols, row));

  // Base 2: Project Tracker
  const projectBase = insertBase("Project Tracker");
  const tasksTable = insertTable(projectBase, "Tasks");
  const tasksCols = insertColumns(tasksTable, [
    { name: "Title", type: "TEXT" },
    { name: "Assignee", type: "TEXT" },
    { name: "Status", type: "TEXT" },
    { name: "Priority", type: "NUMBER" },
    { name: "Hours", type: "NUMBER" },
  ]);

  const tasks = [
    ["Design system audit", "Sarah Lee", "In Progress", 2, 12],
    ["API migration", "Mike Ross", "Done", 3, 24],
    ["Onboarding flow", "Jenny Wu", "Todo", 1, 8],
    ["Payment integration", "Tom Ford", "In Progress", 3, 16],
    ["Accessibility review", "Lisa Ray", "Todo", 2, 10],
    ["Performance tuning", "Nick Park", "Done", 2, 14],
    ["Mobile responsiveness", "Emma Stone", "In Progress", 1, 6],
    ["User research synthesis", "Ryan Grey", "Done", 2, 11],
    ["Release notes", "Olivia Brown", "Todo", 1, 4],
    ["Bug bash", "Chris Evans", "In Progress", 3, 18],
    ["Analytics dashboard", "Sophia Green", "Todo", 2, 20],
    ["Security audit", "Daniel Craig", "Done", 3, 22],
  ];
  tasks.forEach((row) => insertRow(tasksTable, tasksCols, row));

  const milestonesTable = insertTable(projectBase, "Milestones");
  const milestonesCols = insertColumns(milestonesTable, [
    { name: "Name", type: "TEXT" },
    { name: "Target Date", type: "TEXT" },
    { name: "Progress", type: "NUMBER" },
    { name: "Owner", type: "TEXT" },
    { name: "Status", type: "TEXT" },
  ]);

  const milestones = [
    ["Q1 Planning", "2026-01-31", 100, "Sarah Lee", "Complete"],
    ["Alpha Release", "2026-03-15", 85, "Mike Ross", "On Track"],
    ["Beta Launch", "2026-05-01", 45, "Jenny Wu", "At Risk"],
    ["Public Launch", "2026-06-15", 20, "Tom Ford", "On Track"],
  ];
  milestones.forEach((row) => insertRow(milestonesTable, milestonesCols, row));

  // Base 3: Sales CRM
  const crmBase = insertBase("Sales CRM");
  const leadsTable = insertTable(crmBase, "Leads");
  const leadsCols = insertColumns(leadsTable, [
    { name: "Lead Name", type: "TEXT" },
    { name: "Email", type: "TEXT" },
    { name: "Company", type: "TEXT" },
    { name: "Score", type: "NUMBER" },
    { name: "Stage", type: "TEXT" },
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
  leads.forEach((row) => insertRow(leadsTable, leadsCols, row));

  const dealsTable = insertTable(crmBase, "Deals");
  const dealsCols = insertColumns(dealsTable, [
    { name: "Deal Name", type: "TEXT" },
    { name: "Value", type: "NUMBER" },
    { name: "Probability", type: "NUMBER" },
    { name: "Owner", type: "TEXT" },
    { name: "Status", type: "TEXT" },
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
  deals.forEach((row) => insertRow(dealsTable, dealsCols, row));

  console.log("Seeded database successfully.");
  console.log("Bases:", db.prepare("SELECT COUNT(*) AS count FROM bases").get().count);
  console.log("Tables:", db.prepare("SELECT COUNT(*) AS count FROM tables").get().count);
  console.log("Columns:", db.prepare("SELECT COUNT(*) AS count FROM columns").get().count);
  console.log("Rows:", db.prepare("SELECT COUNT(*) AS count FROM rows").get().count);
  console.log("Cells:", db.prepare("SELECT COUNT(*) AS count FROM cells").get().count);
}

seed();
db.close();
