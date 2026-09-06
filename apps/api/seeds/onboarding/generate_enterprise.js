import fs from 'fs';
import path from 'path';

// --- Helpers ---
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;

const now = new Date();
const startOfYear = new Date(now.getFullYear(), 0, 1);
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

const data = {
  departments: [
    { key: "engineering", name: "Engineering" },
    { key: "product", name: "Product" },
    { key: "sales", name: "Sales" },
    { key: "hr", name: "HR" },
    { key: "marketing", name: "Marketing" },
    { key: "finance", name: "Finance" },
    { key: "operations", name: "Operations" }
  ],
  employees: [],
  companies: [],
  customers: [],
  deals: [],
  projects: [],
  products: [],
  receivableInvoices: [],
  payableInvoices: [],
  expenses: []
};

// 1. Employees
const names = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Lisa", "Daniel", "Nancy", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra"];
const surnames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"];

const generateEmployee = (key, department, title, band, salary, isManager = false, managerKey = null) => {
  const name = `${randomItem(names)} ${randomItem(surnames)}`;
  return {
    key,
    name,
    title,
    departmentKey: department,
    status: Math.random() > 0.95 ? "ON_LEAVE" : "ACTIVE",
    hiredAt: randomDate(new Date(2018, 0, 1), thirtyDaysAgo).toISOString(),
    salary,
    equityOptions: randomInt(100, 10000),
    band,
    location: randomItem(["New York, NY", "San Francisco, CA", "Austin, TX", "Remote", "London, UK"]),
    employeeNumber: `EMP-${randomInt(1000, 9999)}`,
    email: `${name.replace(' ', '.').toLowerCase()}@asas-enterprise.com`,
    managerKey
  };
};

data.employees.push(generateEmployee("ceo", null, "Chief Executive Officer", "E9", 350000, true, null));
data.employees.push(generateEmployee("cto", "engineering", "Chief Technology Officer", "E8", 280000, true, "ceo"));
data.employees.push(generateEmployee("cfo", "finance", "Chief Financial Officer", "E8", 260000, true, "ceo"));
data.employees.push(generateEmployee("cro", "sales", "Chief Revenue Officer", "E8", 270000, true, "ceo"));

for(let i = 1; i <= 15; i++) {
  data.employees.push(generateEmployee(`eng_${i}`, "engineering", "Software Engineer", "E4", randomInt(110000, 160000), false, "cto"));
}
for(let i = 1; i <= 8; i++) {
  data.employees.push(generateEmployee(`sales_${i}`, "sales", "Account Executive", "S4", randomInt(80000, 120000), false, "cro"));
}
for(let i = 1; i <= 5; i++) {
  data.employees.push(generateEmployee(`fin_${i}`, "finance", "Financial Analyst", "F3", randomInt(70000, 100000), false, "cfo"));
}

// 2. CRM (Companies, Customers, Deals)
const companyNames = ["Acme Corp", "Globex", "Soylent Corp", "Initech", "Umbrella Corp", "Stark Industries", "Wayne Enterprises", "Cyberdyne", "Massive Dynamic", "Hooli", "Pied Piper", "Aviato", "Endframe", "Raviga", "Belson", "Aperture Science", "Black Mesa"];
companyNames.forEach((name, i) => {
  data.companies.push({
    key: `comp_${i}`,
    name,
    industry: randomItem(["Technology", "Healthcare", "Finance", "Retail", "Manufacturing", "Energy"]),
    website: `www.${name.replace(' ', '').toLowerCase()}.com`
  });
  
  data.customers.push({
    key: `cust_${i}`,
    name: `${randomItem(names)} ${randomItem(surnames)}`,
    email: `contact@${name.replace(' ', '').toLowerCase()}.com`,
    companyKey: `comp_${i}`
  });
});

const stages = ["LEADS", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"];
for(let i = 0; i < 40; i++) {
  const company = randomItem(data.companies);
  const isWon = Math.random() > 0.5;
  const isLost = Math.random() > 0.8;
  let stage = randomItem(stages.slice(0, 3));
  if(isWon) stage = "CLOSED_WON";
  if(isLost && !isWon) stage = "CLOSED_LOST";
  
  data.deals.push({
    key: `deal_${i}`,
    name: `${company.name} - ${randomItem(["Q1", "Q2", "Q3", "Q4"])} ${randomItem(["Expansion", "New License", "Service Agreement", "Enterprise Upgrade"])}`,
    companyKey: company.key,
    ownerEmployeeKey: randomItem(data.employees.filter(e => e.departmentKey === "sales")).key,
    stage: stage,
    value: randomInt(10000, 500000),
    winProbability: stage === "CLOSED_WON" ? 1 : stage === "CLOSED_LOST" ? 0 : randomFloat(0.1, 0.9),
    closeDate: randomDate(thirtyDaysAgo, nextMonth).toISOString(),
    createdAt: randomDate(startOfYear, now).toISOString()
  });
}

// 3. Projects
const projectStatuses = ["PLANNING", "ON_TRACK", "DELAYED", "AT_RISK", "COMPLETED"];
const projectNames = ["Project Alpha", "Project Beta", "Website Redesign", "Mobile App Launch", "Q3 Marketing Campaign", "Infrastructure Migration", "Security Audit", "ERP Implementation", "Sales Training Program"];
projectNames.forEach((name, i) => {
  const status = randomItem(projectStatuses);
  data.projects.push({
    key: `proj_${i}`,
    name,
    description: `Comprehensive execution plan for ${name}`,
    status,
    startDate: randomDate(startOfYear, thirtyDaysAgo).toISOString(),
    dueDate: randomDate(now, nextMonth).toISOString(),
    budget: randomInt(50000, 2000000),
    tasks: Array.from({length: randomInt(5, 15)}).map((_, j) => ({
      title: `Task ${j+1} for ${name}`,
      status: randomItem(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]),
      priority: randomItem(["LOW", "MEDIUM", "HIGH"]),
      dueDate: randomDate(now, nextMonth).toISOString()
    }))
  });
});

data.roadmapPhases = [];
const phaseNames = ["Q1 Planning", "Q2 Execution", "Q3 Expansion", "Q4 Review"];
phaseNames.forEach((name, i) => {
  data.roadmapPhases.push({
    title: name,
    sortOrder: i,
    tasks: Array.from({length: randomInt(3, 8)}).map((_, j) => ({
      title: `Strategic Goal ${j+1} in ${name}`,
      statusLabel: randomItem(["In Progress", "Planned", "Completed"]),
      progressPct: randomInt(0, 100),
      startDate: randomDate(startOfYear, now).toISOString(),
      endDate: randomDate(now, nextMonth).toISOString()
    }))
  });
});

data.sprints = [];
for (let i = 0; i < 5; i++) {
  data.sprints.push({
    name: `Sprint ${i + 1}`,
    completionPct: randomInt(0, 100),
    endsAt: randomDate(now, nextMonth).toISOString(),
    issues: Array.from({length: randomInt(5, 20)}).map((_, j) => ({
      title: `JIRA-${randomInt(100, 999)}`,
      type: randomItem(["STORY", "BUG", "TASK"]),
      status: randomItem(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
      priority: randomItem(["LOW", "MEDIUM", "HIGH"]),
      storyPoints: randomItem([1, 2, 3, 5, 8])
    }))
  });
}

// 4. Inventory
const categories = ["Electronics", "Office Supplies", "Furniture", "Software Licenses", "Merchandise"];
for(let i = 0; i < 45; i++) {
  const qty = randomInt(0, 500);
  data.products.push({
    key: `prod_${i}`,
    sku: `SKU-${randomInt(10000, 99999)}`,
    name: `${randomItem(["Pro", "Max", "Lite", "Enterprise", "Basic"])} ${randomItem(["Widget", "Device", "License", "Pack", "Module", "System"])} ${i+1}`,
    category: randomItem(categories),
    price: randomInt(10, 5000),
    cost: randomInt(5, 2500),
    quantity: qty,
    stockStatus: qty === 0 ? "OUT_OF_STOCK" : qty < 50 ? "LOW_STOCK" : "IN_STOCK"
  });
}

// 5. Finance (Receivables & Ledger)
const invoiceStatuses = ["CURRENT", "OVERDUE", "IN_COLLECTIONS"];
data.receivableInvoices = [];
for (let i = 0; i < 60; i++) {
  const customer = randomItem(data.customers);
  const isPaid = Math.random() > 0.4;
  data.receivableInvoices.push({
    number: `INV-${1000 + i}`,
    customerKey: customer.key,
    amount: randomInt(1000, 50000),
    dueDate: randomDate(now, nextMonth).toISOString(),
    status: isPaid ? "PAID" : randomItem(invoiceStatuses),
    createdAt: randomDate(startOfYear, now).toISOString(),
    updatedAt: isPaid ? randomDate(thirtyDaysAgo, now).toISOString() : new Date().toISOString()
  });
}

const expenseCategories = ["SOFTWARE", "TRAVEL", "MEALS", "OFFICE_SUPPLIES", "FACILITIES_LEASE", "OTHER"];
for(let i = 0; i < 100; i++) {
  const employee = randomItem(data.employees);
  data.expenses.push({
    employeeKey: employee.key,
    name: `Expense ${i+1}`,
    category: randomItem(expenseCategories),
    merchant: randomItem(["Amazon", "Uber", "Delta Airlines", "Starbucks", "WeWork", "AWS", "Google Cloud", "Microsoft"]),
    date: randomDate(startOfYear, now).toISOString(),
    amount: randomInt(15, 2000),
    status: randomItem(["APPROVED", "PENDING", "REJECTED", "PROCESSING"])
  });
}

// Cash flows and Ledger
data.cashFlowSnapshots = [];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
for (let i = 0; i < now.getMonth() + 1; i++) {
  const inflow = randomInt(50000, 250000);
  const outflow = randomInt(30000, 150000);
  data.cashFlowSnapshots.push({
    month: months[i],
    inflow,
    outflow,
    net: inflow - outflow
  });
}

data.ledgerTransactions = [];
for (let i = 0; i < 40; i++) {
  const isCredit = Math.random() > 0.4;
  data.ledgerTransactions.push({
    date: randomDate(startOfYear, now).toISOString(),
    description: isCredit ? `Payment from ${randomItem(companyNames)}` : `Payment to ${randomItem(["AWS", "GCP", "Salesforce", "Google Workspace"])}`,
    amount: randomInt(500, 15000),
    status: "CLEARED",
    isCredit: isCredit
  });
}

// 6. Recruitment
data.candidates = [];
const candidateStages = ["APPLIED", "SCREENING", "TECH_INTERVIEW", "FINAL_INTERVIEW", "OFFER_SENT", "HIRED", "REJECTED"];
for (let i = 0; i < 20; i++) {
  const stage = randomItem(candidateStages);
  // Hired ones are older, others are more recent
  const appliedAt = stage === 'HIRED' || stage === 'REJECTED' 
    ? randomDate(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000))
    : randomDate(thirtyDaysAgo, now);
  
  const daysSinceApplied = Math.floor((now - appliedAt) / (1000 * 60 * 60 * 24));
  let timeInStageNum = 0;
  if (stage === 'APPLIED') {
    timeInStageNum = daysSinceApplied;
  } else {
    timeInStageNum = randomInt(1, Math.max(2, daysSinceApplied - 2));
  }
  
  const source = randomItem(["LinkedIn", "Referral", "Careers Page", "Indeed"]);
  
  data.candidates.push({
    name: `Candidate ${i+1}`,
    role: randomItem(["Software Engineer", "Product Manager", "Designer", "Sales Representative"]),
    stage: stage,
    timeInStage: `${timeInStageNum} day${timeInStageNum === 1 ? '' : 's'}`,
    appliedAt: appliedAt.toISOString(),
    source: source,
    currentRole: randomItem(["Junior Developer", "Senior PM", "UI Designer", "Sales Associate"]),
    experience: `${randomInt(2, 10)} years`,
    location: randomItem(["New York", "San Francisco", "Remote", "London"]),
    email: `candidate${i+1}@example.com`,
    education: "BS Computer Science",
    resumeUrl: "resume.pdf",
    activities: [
      {
        action: "Application Submitted",
        description: `Applied via ${source}`,
        createdAt: appliedAt.toISOString()
      }
    ]
  });
}

// 7. Time & Attendance
data.timesheets = [];
data.attendanceExceptions = [];
data.leaveRequests = [];
for (const employee of data.employees) {
  // Exceptions
  const empExceptions = [];
  if (Math.random() > 0.7) {
    const type = randomItem(["MISSING_IN", "MISSING_OUT", "OVERTIME"]);
    empExceptions.push({
      employeeKey: employee.key,
      type,
      label: type === "OVERTIME" ? "Unauthorized Overtime" : "Missed punch",
      date: randomDate(thirtyDaysAgo, now).toISOString()
    });
  }
  data.attendanceExceptions.push(...empExceptions);

  const weekStart = randomDate(thirtyDaysAgo, now);
  let regularHours = 0;
  let overtimeHours = 0;

  const days = Array.from({length: 5}).map((_, i) => {
    // Generate realistic variable punch times
    let clockInHour = 9;
    let clockInMinute = randomInt(0, 59);
    // 20% chance to be late (after 9:15 AM)
    if (Math.random() > 0.8) {
      clockInHour = 9;
      clockInMinute = randomInt(16, 59);
    } else {
      // Normal arrival between 8:45 and 9:10
      clockInHour = Math.random() > 0.5 ? 8 : 9;
      clockInMinute = clockInHour === 8 ? randomInt(45, 59) : randomInt(0, 10);
    }

    let clockOutHour = 17; // 5 PM
    let clockOutMinute = randomInt(0, 30);
    // 15% chance to leave early (before 5:00 PM)
    if (Math.random() > 0.85) {
      clockOutHour = 16;
      clockOutMinute = randomInt(30, 59);
    } 
    // 15% chance of overtime (after 6:00 PM)
    else if (Math.random() > 0.85) {
      clockOutHour = randomInt(18, 20);
      clockOutMinute = randomInt(0, 59);
    }

    const clockInStr = `${clockInHour === 8 ? '08' : '09'}:${clockInMinute.toString().padStart(2, '0')} AM`;
    
    let displayOutHour = clockOutHour > 12 ? clockOutHour - 12 : clockOutHour;
    const ampm = clockOutHour >= 12 ? 'PM' : 'AM';
    const clockOutStr = `${displayOutHour.toString().padStart(2, '0')}:${clockOutMinute.toString().padStart(2, '0')} ${ampm}`;

    // Calculate total hours
    const inDate = new Date(`2000-01-01 ${clockInStr}`);
    const outDate = new Date(`2000-01-01 ${clockOutStr}`);
    const diffMs = outDate - inDate;
    const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    const total = Math.max(0, diffHours);
    
    if (total > 8) {
      regularHours += 8;
      overtimeHours += (total - 8);
    } else {
      regularHours += total;
    }

    return {
      dayLabel: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][i],
      clockIn: clockInStr,
      clockOut: clockOutStr,
      totalHours: total
    };
  });

  // Timesheets
  data.timesheets.push({
    employeeKey: employee.key,
    weekStart: weekStart.toISOString(),
    regularHours: Math.round(regularHours * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    days
  });
  // Leave
  if (Math.random() > 0.8) {
    data.leaveRequests.push({
      employeeKey: employee.key,
      type: randomItem(["VACATION", "SICK", "PERSONAL"]),
      startDate: randomDate(now, nextMonth).toISOString(),
      endDate: randomDate(nextMonth, new Date(nextMonth.getTime() + 7*24*60*60*1000)).toISOString(),
      status: randomItem(["PENDING", "APPROVED", "REJECTED"])
    });
  }
}

// 8. Payroll
data.payrollRuns = [];
data.payrollRuns.push({
  label: "July 2026 Payroll",
  payDate: new Date("2026-07-31T00:00:00.000Z").toISOString(),
  status: "PAID",
  lines: data.employees.map(emp => {
    const grossCents = Math.round((emp.salary / 12) * 100);
    const federalTaxCents = Math.round(grossCents * 0.15);
    const stateTaxCents = Math.round(grossCents * 0.05);
    const deductionsCents = federalTaxCents + stateTaxCents;
    const netCents = grossCents - deductionsCents;
    
    return {
      employeeKey: emp.key,
      gross: grossCents / 100,
      deductions: deductionsCents / 100,
      net: netCents / 100,
      taxLines: [
        { label: "Federal Tax", amount: federalTaxCents / 100 },
        { label: "State Tax", amount: stateTaxCents / 100 }
      ]
    };
  })
});

// 9. Accounts Payable (Vendors & Invoices)
data.vendors = [];
const vendorNames = ["AWS", "Google Cloud", "Salesforce", "Slack", "Microsoft", "Zoom"];
vendorNames.forEach((name, i) => {
  data.vendors.push({
    key: `vendor_${i}`,
    name
  });
});

  data.payableInvoices = [];
  for (let i = 0; i < 30; i++) {
    const vendor = randomItem(data.vendors);
    const status = randomItem(["PENDING", "SCHEDULED", "APPROVED", "PAID", "REJECTED"]);
    let date;
    if (status === "SCHEDULED") {
      date = randomDate(now, nextMonth).toISOString();
    } else if (status === "PENDING" || status === "APPROVED") {
      date = randomDate(thirtyDaysAgo, nextMonth).toISOString();
    } else {
      date = randomDate(startOfYear, now).toISOString();
    }

    data.payableInvoices.push({
      vendorKey: vendor.key,
      invoiceNumber: `AP-${2000 + i}`,
      date,
      amount: randomInt(500, 10000),
      status
    });
  }

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.writeFileSync(path.join(__dirname, 'enterprise.json'), JSON.stringify(data, null, 2));
console.log('Successfully generated enterprise.json');
