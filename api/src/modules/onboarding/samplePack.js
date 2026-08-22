import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppError } from '../../utils/errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function getSeedPackRoot() {
  return process.env.SEED_PACK_PATH
    ? path.resolve(process.env.SEED_PACK_PATH)
    : path.resolve(__dirname, '../../../seeds/onboarding')
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function parseDate(value) {
  if (!value) return null
  return new Date(value)
}

/**
 * Applies the HR sample pack to a tenant. Safe to call only when tenant has no HR rows
 * (or after explicit wipe). Does not touch other tenants.
 */
export async function applyHrSamplePack(prisma, tenantId) {
  const packPath = path.join(getSeedPackRoot(), 'hr.json')
  let pack
  try {
    pack = await readJson(packPath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError(503, 'Sample onboarding pack is not available on this server')
    }
    throw error
  }

  const existing = await prisma.employee.count({ where: { tenantId } })
  if (existing > 0) {
    throw new AppError(409, 'This workspace already has HR data. Sample pack was not applied.')
  }

  const departmentIds = {}
  for (const dept of pack.departments || []) {
    const created = await prisma.department.create({
      data: { tenantId, name: dept.name },
    })
    departmentIds[dept.key] = created.id
  }

  const employeeIds = {}
  // First pass without managers
  for (const emp of pack.employees || []) {
    const created = await prisma.employee.create({
      data: {
        tenantId,
        name: emp.name,
        title: emp.title,
        status: emp.status || 'ACTIVE',
        departmentId: emp.departmentKey ? departmentIds[emp.departmentKey] : null,
        hiredAt: parseDate(emp.hiredAt),
        salary: emp.salary ?? null,
        equityOptions: emp.equityOptions ?? null,
        band: emp.band ?? null,
        location: emp.location ?? null,
        employeeNumber: emp.employeeNumber ?? null,
        email: emp.email ?? null,
        avatarUrl: emp.avatarUrl ?? null,
      },
    })
    employeeIds[emp.key] = created.id
  }

  // Second pass: managers
  for (const emp of pack.employees || []) {
    if (!emp.managerKey || !employeeIds[emp.managerKey]) continue
    await prisma.employee.update({
      where: { id: employeeIds[emp.key] },
      data: { managerId: employeeIds[emp.managerKey] },
    })
  }

  if (pack.payrollRun) {
    const run = await prisma.payrollRun.create({
      data: {
        tenantId,
        label: pack.payrollRun.label,
        payDate: parseDate(pack.payrollRun.payDate),
        status: pack.payrollRun.status || 'PENDING',
      },
    })
    for (const line of pack.payrollRun.lines || []) {
      const employeeId = employeeIds[line.employeeKey]
      if (!employeeId) continue
      const createdLine = await prisma.payrollLine.create({
        data: {
          tenantId,
          payrollRunId: run.id,
          employeeId,
          gross: line.gross ?? 0,
          deductions: line.deductions ?? 0,
          net: line.net ?? 0,
          baseSalary: line.baseSalary ?? null,
          missedDaysCount: line.missedDaysCount ?? null,
          missedDaysAmount: line.missedDaysAmount ?? null,
          bonusLabel: line.bonusLabel ?? null,
          bonusAmount: line.bonusAmount ?? null,
        },
      })
      for (const tax of line.taxes || []) {
        await prisma.payrollTaxLine.create({
          data: {
            payrollLineId: createdLine.id,
            label: tax.label,
            amount: tax.amount,
            override: Boolean(tax.override),
          },
        })
      }
    }
  }

  for (const leave of pack.leaveRequests || []) {
    const employeeId = employeeIds[leave.employeeKey]
    if (!employeeId) continue
    await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId,
        type: leave.type,
        startDate: parseDate(leave.startDate),
        endDate: parseDate(leave.endDate),
        status: leave.status || 'PENDING',
      },
    })
  }

  for (const ex of pack.attendanceExceptions || []) {
    const employeeId = employeeIds[ex.employeeKey]
    if (!employeeId) continue
    await prisma.attendanceException.create({
      data: {
        tenantId,
        employeeId,
        type: ex.type,
        label: ex.label,
        date: parseDate(ex.date),
        alert: ex.alert !== false,
      },
    })
  }

  for (const sheet of pack.timesheets || []) {
    const employeeId = employeeIds[sheet.employeeKey]
    if (!employeeId) continue
    await prisma.timesheet.create({
      data: {
        tenantId,
        employeeId,
        weekStart: parseDate(sheet.weekStart),
        regularHours: sheet.regularHours ?? 0,
        overtimeHours: sheet.overtimeHours ?? 0,
        totalHours: sheet.totalHours ?? 0,
        days: {
          create: (sheet.days || []).map(day => ({
            dayLabel: day.dayLabel,
            clockIn: day.clockIn ?? null,
            clockOut: day.clockOut ?? null,
            totalHours: day.totalHours ?? null,
          })),
        },
      },
    })
  }

  for (const cand of pack.candidates || []) {
    await prisma.candidate.create({
      data: {
        tenantId,
        name: cand.name,
        role: cand.role,
        stage: cand.stage || 'APPLIED',
        timeInStage: cand.timeInStage ?? null,
        appliedAt: parseDate(cand.appliedAt) || new Date(),
        avatarUrl: cand.avatarUrl ?? null,
        currentRole: cand.currentRole ?? null,
        experience: cand.experience ?? null,
        source: cand.source ?? null,
        location: cand.location ?? null,
        email: cand.email ?? null,
        education: cand.education ?? null,
        resumeUrl: cand.resumeUrl ?? null,
        activities: {
          create: (cand.activities || []).map(a => ({
            action: a.action,
            description: a.description ?? null,
            createdAt: parseDate(a.createdAt) || new Date(),
          })),
        },
      },
    })
  }

  return {
    departments: Object.keys(departmentIds).length,
    employees: Object.keys(employeeIds).length,
    candidates: (pack.candidates || []).length,
  }
}

/**
 * Applies the Enterprise sample pack to a tenant.
 */
export async function applyEnterpriseSamplePack(prisma, tenantId) {
  const packPath = path.join(getSeedPackRoot(), 'enterprise.json')
  let pack
  try {
    pack = await readJson(packPath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError(503, 'Enterprise sample pack is not available on this server')
    }
    throw error
  }

  // 1. HR
  const departmentIds = {}
  for (const dept of pack.departments || []) {
    const created = await prisma.department.create({
      data: { tenantId, name: dept.name },
    })
    departmentIds[dept.key] = created.id
  }

  const employeeIds = {}
  for (const emp of pack.employees || []) {
    const created = await prisma.employee.create({
      data: {
        tenantId,
        name: emp.name,
        title: emp.title,
        status: emp.status || 'ACTIVE',
        departmentId: emp.departmentKey ? departmentIds[emp.departmentKey] : null,
        hiredAt: parseDate(emp.hiredAt),
        salary: emp.salary ?? null,
        equityOptions: emp.equityOptions ?? null,
        band: emp.band ?? null,
        location: emp.location ?? null,
        employeeNumber: emp.employeeNumber ?? null,
        email: emp.email ?? null,
      },
    })
    employeeIds[emp.key] = created.id
  }

  // Managers
  for (const emp of pack.employees || []) {
    if (!emp.managerKey || !employeeIds[emp.managerKey]) continue
    await prisma.employee.update({
      where: { id: employeeIds[emp.key] },
      data: { managerId: employeeIds[emp.managerKey] },
    })
  }

  // 2. CRM
  const companyIds = {}
  for (const comp of pack.companies || []) {
    const created = await prisma.company.create({
      data: {
        tenantId,
        name: comp.name,
      }
    })
    companyIds[comp.key] = created.id
  }

  const customerIds = {}
  for (const cust of pack.customers || []) {
    const created = await prisma.customer.create({
      data: {
        tenantId,
        name: cust.name,
      }
    })
    customerIds[cust.key] = created.id
  }

  for (const deal of pack.deals || []) {
    await prisma.deal.create({
      data: {
        tenantId,
        name: deal.name,
        companyId: companyIds[deal.companyKey],
        ownerEmployeeId: employeeIds[deal.ownerEmployeeKey] || null,
        stage: deal.stage,
        value: deal.value,
        winProbability: deal.winProbability,
        closeDate: parseDate(deal.closeDate),
        createdAt: parseDate(deal.createdAt) || new Date(),
      }
    })
  }

  // 3. Projects
  for (const proj of pack.projects || []) {
    await prisma.project.create({
      data: {
        tenantId,
        name: proj.name,
        status: proj.status,
        timeline: parseDate(proj.dueDate),
        budget: proj.budget,
      }
    })
  }

  for (const phase of pack.roadmapPhases || []) {
    await prisma.roadmapPhase.create({
      data: {
        tenantId,
        title: phase.title,
        sortOrder: phase.sortOrder,
        tasks: {
          create: (phase.tasks || []).map(t => ({
            tenantId,
            title: t.title,
            statusLabel: t.statusLabel,
            progressPct: t.progressPct,
            startDate: parseDate(t.startDate),
            endDate: parseDate(t.endDate),
          }))
        }
      }
    })
  }

  for (const sprint of pack.sprints || []) {
    await prisma.sprint.create({
      data: {
        tenantId,
        name: sprint.name,
        completionPct: sprint.completionPct,
        endsAt: parseDate(sprint.endsAt),
        issues: {
          create: (sprint.issues || []).map(issue => ({
            tenantId,
            title: issue.title,
            tag: issue.type,
            status: issue.status,
            priority: issue.priority,
          }))
        }
      }
    })
  }

  // 4. Inventory
  for (const prod of pack.products || []) {
    await prisma.product.create({
      data: {
        tenantId,
        sku: prod.sku,
        name: prod.name,
        price: prod.price,
        stock: prod.quantity,
        status: prod.stockStatus,
      }
    })
  }

  // 5. Finance
  for (const inv of pack.receivableInvoices || []) {
    await prisma.receivableInvoice.create({
      data: {
        tenantId,
        number: inv.number,
        customerId: customerIds[inv.customerKey],
        amount: inv.amount,
        dueDate: parseDate(inv.dueDate),
        status: inv.status,
        createdAt: parseDate(inv.createdAt) || new Date(),
        updatedAt: parseDate(inv.updatedAt) || new Date(),
      }
    })
  }

  for (const exp of pack.expenses || []) {
    await prisma.expense.create({
      data: {
        tenantId,
        employeeId: employeeIds[exp.employeeKey],
        name: exp.name,
        category: exp.category,
        merchant: exp.merchant,
        date: parseDate(exp.date),
        amount: exp.amount,
        status: exp.status,
      }
    })
  }

  for (const cash of pack.cashFlowSnapshots || []) {
    await prisma.cashFlowSnapshot.create({
      data: {
        tenantId,
        month: cash.month,
        inflow: cash.inflow,
        outflow: cash.outflow,
        net: cash.net,
      }
    })
  }

  for (const ledger of pack.ledgerTransactions || []) {
    await prisma.ledgerTransaction.create({
      data: {
        tenantId,
        date: parseDate(ledger.date),
        description: ledger.description,
        amount: ledger.amount,
        status: ledger.status,
        isCredit: ledger.isCredit,
      }
    })
  }

  // 6. Recruitment
  for (const cand of pack.candidates || []) {
    await prisma.candidate.create({
      data: {
        tenantId,
        name: cand.name,
        role: cand.role,
        stage: cand.stage,
        timeInStage: cand.timeInStage,
        currentRole: cand.currentRole,
        experience: cand.experience,
        source: cand.source,
        location: cand.location,
        appliedAt: parseDate(cand.appliedAt),
        activities: {
          create: (cand.activities || []).map(act => ({
            action: act.action,
            description: act.description,
            createdAt: parseDate(act.createdAt)
          }))
        }
      }
    })
  }

  // 7. Time & Attendance
  for (const ts of pack.timesheets || []) {
    await prisma.timesheet.create({
      data: {
        tenantId,
        employeeId: employeeIds[ts.employeeKey],
        weekStart: parseDate(ts.weekStart),
        regularHours: ts.regularHours,
        overtimeHours: ts.overtimeHours,
        totalHours: ts.totalHours ?? (ts.regularHours + ts.overtimeHours),
        days: {
          create: (ts.days || []).map(day => ({
            dayLabel: day.dayLabel,
            clockIn: day.clockIn,
            clockOut: day.clockOut,
            totalHours: day.totalHours
          }))
        }
      }
    })
  }

  for (const exc of pack.attendanceExceptions || []) {
    await prisma.attendanceException.create({
      data: {
        tenantId,
        employeeId: employeeIds[exc.employeeKey],
        type: exc.type,
        label: exc.label,
        date: parseDate(exc.date)
      }
    })
  }

  for (const lv of pack.leaveRequests || []) {
    await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: employeeIds[lv.employeeKey],
        type: lv.type,
        startDate: parseDate(lv.startDate),
        endDate: parseDate(lv.endDate),
        status: lv.status
      }
    })
  }

  // 8. Payroll
  for (const pr of pack.payrollRuns || []) {
    await prisma.payrollRun.create({
      data: {
        tenantId,
        label: pr.label,
        payDate: parseDate(pr.payDate),
        status: pr.status,
        lines: {
          create: (pr.lines || []).map(line => ({
            tenantId,
            employeeId: employeeIds[line.employeeKey],
            gross: line.gross,
            deductions: line.deductions,
            net: line.net,
            taxLines: {
              create: (line.taxLines || []).map(tax => ({
                label: tax.label,
                amount: tax.amount
              }))
            }
          }))
        }
      }
    })
  }

  // 9. Accounts Payable
  const vendorIds = {}
  for (const v of pack.vendors || []) {
    const created = await prisma.vendor.create({
      data: {
        tenantId,
        name: v.name
      }
    })
    vendorIds[v.key] = created.id
  }

  for (const inv of pack.payableInvoices || []) {
    await prisma.payableInvoice.create({
      data: {
        tenantId,
        vendorId: vendorIds[inv.vendorKey],
        invoiceNumber: inv.invoiceNumber,
        date: parseDate(inv.date),
        amount: inv.amount,
        status: inv.status
      }
    })
  }

  return {
    departments: Object.keys(departmentIds).length,
    employees: Object.keys(employeeIds).length,
    companies: Object.keys(companyIds).length,
    projects: (pack.projects || []).length,
    products: (pack.products || []).length,
    invoices: (pack.receivableInvoices || []).length,
  }
}
