import { AppError } from '../../utils/errors.js'
import { parsePagination } from '../../utils/pagination.js'

const employeeInclude = {
  department: true,
  manager: { select: { id: true, name: true, title: true } },
  _count: { select: { reports: true } },
}

function mapEmployee(employee) {
  if (!employee) return null
  return {
    id: employee.id,
    name: employee.name,
    title: employee.title,
    role: employee.title,
    status: employee.status === 'ON_LEAVE' ? 'On Leave' : 'Active',
    statusCode: employee.status,
    department: employee.department?.name ?? null,
    departmentId: employee.departmentId,
    manager: employee.manager
      ? { id: employee.manager.id, name: employee.manager.name, role: employee.manager.title }
      : null,
    managerId: employee.managerId,
    directReports: employee._count?.reports ?? 0,
    avatarUrl: employee.avatarUrl,
    hiredAt: employee.hiredAt,
    salary: employee.salary,
    equityOptions: employee.equityOptions,
    band: employee.band,
    location: employee.location,
    employeeNumber: employee.employeeNumber,
    email: employee.email,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  }
}

function mapCandidate(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    role: candidate.role,
    stage: formatStage(candidate.stage),
    stageCode: candidate.stage,
    timeInStage: candidate.timeInStage,
    applied: candidate.appliedAt,
    avatar: candidate.avatarUrl,
    profile: {
      currentRole: candidate.currentRole,
      experience: candidate.experience,
      source: candidate.source,
      location: candidate.location,
      email: candidate.email,
      education: candidate.education,
      resume: candidate.resumeUrl,
    },
    activity: (candidate.activities || []).map(a => ({
      action: a.action,
      desc: a.description,
      time: a.createdAt,
    })),
  }
}

const STAGE_LABELS = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECH_INTERVIEW: 'Tech Interview',
  FINAL_INTERVIEW: 'Final Interview',
  OFFER_SENT: 'Offer Sent',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

function formatStage(stage) {
  return STAGE_LABELS[stage] || stage
}

function parseOptionalDate(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return new Date(value)
}

export async function listDepartments(prisma, tenantId) {
  return prisma.department.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
}

export async function createDepartment(prisma, tenantId, input) {
  const existing = await prisma.department.findFirst({ where: { tenantId, name: input.name } })
  if (existing) throw new AppError(409, 'Department already exists')
  return prisma.department.create({ data: { tenantId, name: input.name } })
}

export async function listEmployees(prisma, tenantId, query = {}) {
  const { page, limit, skip } = parsePagination(query)
  const where = { tenantId }
  if (query.departmentId) where.departmentId = query.departmentId
  if (query.status === 'Active') where.status = 'ACTIVE'
  if (query.status === 'On Leave' || query.status === 'ON_LEAVE') where.status = 'ON_LEAVE'
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { title: { contains: query.search } },
      { email: { contains: query.search } },
      { employeeNumber: { contains: query.search } },
    ]
  }

  const [items, total, onLeaveCount] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: employeeInclude,
    }),
    prisma.employee.count({ where }),
    prisma.employee.count({ where: { tenantId, status: 'ON_LEAVE' } }),
  ])

  const headcount = await prisma.employee.count({ where: { tenantId } })

  return {
    items: items.map(mapEmployee),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
    stats: {
      totalHeadcount: headcount,
      onLeaveCount,
      openRoles: Number(query.openRoles) || 0,
    },
  }
}

export async function getEmployee(prisma, tenantId, id) {
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId },
    include: employeeInclude,
  })
  if (!employee) throw new AppError(404, 'Employee not found')
  return mapEmployee(employee)
}

export async function createEmployee(prisma, tenantId, input) {
  const employee = await prisma.employee.create({
    data: {
      tenantId,
      name: input.name,
      title: input.title,
      departmentId: input.departmentId ?? null,
      managerId: input.managerId ?? null,
      status: input.status || 'ACTIVE',
      avatarUrl: input.avatarUrl ?? null,
      hiredAt: parseOptionalDate(input.hiredAt) ?? null,
      salary: input.salary ?? null,
      equityOptions: input.equityOptions ?? null,
      band: input.band ?? null,
      location: input.location ?? null,
      employeeNumber: input.employeeNumber ?? null,
      email: input.email ?? null,
    },
    include: employeeInclude,
  })
  return mapEmployee(employee)
}

export async function updateEmployee(prisma, tenantId, id, input) {
  const existing = await prisma.employee.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Employee not found')
  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
      ...(input.managerId !== undefined && { managerId: input.managerId }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      ...(input.hiredAt !== undefined && { hiredAt: parseOptionalDate(input.hiredAt) }),
      ...(input.salary !== undefined && { salary: input.salary }),
      ...(input.equityOptions !== undefined && { equityOptions: input.equityOptions }),
      ...(input.band !== undefined && { band: input.band }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.employeeNumber !== undefined && { employeeNumber: input.employeeNumber }),
      ...(input.email !== undefined && { email: input.email }),
    },
    include: employeeInclude,
  })
  return mapEmployee(employee)
}

export async function deleteEmployee(prisma, tenantId, id) {
  const existing = await prisma.employee.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Employee not found')
  await prisma.employee.delete({ where: { id } })
}

export async function listPayrollRuns(prisma, tenantId) {
  const runs = await prisma.payrollRun.findMany({
    where: { tenantId },
    orderBy: { payDate: 'desc' },
    include: {
      lines: {
        include: {
          employee: { include: { department: true } },
          taxLines: true,
        },
      },
    },
  })

  return runs.map(run => {
    const lines = run.lines.map(line => ({
      id: line.id,
      employee: line.employee.name,
      avatar: line.employee.avatarUrl,
      department: line.employee.department?.name ?? null,
      idNumber: line.employee.employeeNumber,
      gross: line.gross,
      deductions: line.deductions,
      net: line.net,
      breakdown: {
        baseSalary: line.baseSalary,
        missedDays: {
          count: line.missedDaysCount ?? 0,
          amount: line.missedDaysAmount ?? 0,
        },
        bonus: {
          label: line.bonusLabel,
          amount: line.bonusAmount ?? 0,
        },
        taxes: line.taxLines.map(t => ({
          label: t.label,
          amount: t.amount,
          override: t.override,
        })),
      },
    }))
    const totalGross = lines.reduce((sum, l) => sum + l.gross, 0)
    const totalNet = lines.reduce((sum, l) => sum + l.net, 0)
    const taxes = lines.reduce((sum, l) => sum + l.deductions, 0)
    return {
      id: run.id,
      label: run.label,
      payDate: run.payDate,
      status: run.status,
      lines,
      totals: { totalGross, taxes, totalNet },
    }
  })
}

export async function approvePayrollRun(prisma, tenantId, id) {
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId } })
  if (!run) throw new AppError(404, 'Payroll run not found')
  return prisma.payrollRun.update({
    where: { id },
    data: { status: 'APPROVED' },
  })
}

export async function patchPayrollLine(prisma, tenantId, id, input) {
  const line = await prisma.payrollLine.findFirst({ where: { id, tenantId } })
  if (!line) throw new AppError(404, 'Payroll line not found')
  return prisma.payrollLine.update({ where: { id }, data: input })
}

export async function listAttendance(prisma, tenantId) {
  const [leaveRequests, timesheets] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
      include: { employee: true },
    }),
    prisma.timesheet.findMany({
      where: { tenantId },
      orderBy: { weekStart: 'desc' },
      take: 20,
      include: { employee: true, days: true },
    }),
  ])

  // Dynamically calculate exceptions based on Timesheet days
  const dynamicExceptions = [];
  
  for (const ts of timesheets) {
    if (!ts.days) continue;
    
    // We'll just assign dates to the days within the week for the exception display
    const weekStart = new Date(ts.weekStart);
    
    ts.days.forEach((day, index) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(dayDate.getDate() + index); // Mon, Tue, Wed, Thu, Fri...
      
      const inDate = new Date(`2000-01-01 ${day.clockIn}`);
      const outDate = new Date(`2000-01-01 ${day.clockOut}`);
      
      const missingIn = !day.clockIn;
      const missingOut = !day.clockOut;
      
      // Late: after 9:15 AM
      const late = day.clockIn && (inDate.getHours() > 9 || (inDate.getHours() === 9 && inDate.getMinutes() > 15));
      // Early Out: before 5:00 PM (17:00)
      const earlyOut = day.clockOut && (outDate.getHours() < 17);
      const overtime = day.totalHours > 8;
      
      if (missingIn || missingOut) {
        dynamicExceptions.push({
          id: `exc-${day.id}-missing`,
          name: ts.employee.name,
          avatar: ts.employee.avatarUrl,
          type: missingIn ? 'missing_in' : 'missing_out',
          label: 'Missed punch',
          date: dayDate,
          alert: true,
          employeeId: ts.employeeId
        });
      }
      
      if (late) {
        dynamicExceptions.push({
          id: `exc-${day.id}-late`,
          name: ts.employee.name,
          avatar: ts.employee.avatarUrl,
          type: 'late',
          label: 'Late Arrival',
          date: dayDate,
          alert: true,
          employeeId: ts.employeeId
        });
      }

      if (earlyOut) {
        dynamicExceptions.push({
          id: `exc-${day.id}-early`,
          name: ts.employee.name,
          avatar: ts.employee.avatarUrl,
          type: 'early_out',
          label: 'Early Departure',
          date: dayDate,
          alert: true,
          employeeId: ts.employeeId
        });
      }
      
      if (overtime) {
        dynamicExceptions.push({
          id: `exc-${day.id}-ot`,
          name: ts.employee.name,
          avatar: ts.employee.avatarUrl,
          type: 'overtime',
          label: 'Unauthorized Overtime',
          date: dayDate,
          alert: false,
          employeeId: ts.employeeId
        });
      }
    });
  }

  return {
    exceptions: dynamicExceptions.sort((a, b) => b.date - a.date),
    leaveRequests: leaveRequests.map(lr => ({
      id: lr.id,
      name: lr.employee.name,
      avatar: lr.employee.avatarUrl,
      type: lr.type === 'SICK' ? 'Sick Leave' : lr.type === 'VACATION' ? 'Vacation' : 'Personal',
      typeCode: lr.type,
      date: lr.startDate,
      endDate: lr.endDate,
      status: lr.status,
      employeeId: lr.employeeId,
    })),
    timesheets: timesheets.map(ts => ({
      id: ts.id,
      employeeId: ts.employeeId,
      employeeName: ts.employee.name,
      weekStart: ts.weekStart,
      regularHours: ts.regularHours,
      overtimeHours: ts.overtimeHours,
      totalHours: ts.totalHours,
      days: ts.days,
    })),
  }
}

export async function createLeaveRequest(prisma, tenantId, input) {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId } })
  if (!employee) throw new AppError(404, 'Employee not found')
  return prisma.leaveRequest.create({
    data: {
      tenantId,
      employeeId: input.employeeId,
      type: input.type,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      status: input.status || 'PENDING',
    },
  })
}

export async function listCandidates(prisma, tenantId, query = {}) {
  const { page, limit, skip } = parsePagination(query)
  const where = { tenantId }
  if (query.stage) {
    const code = Object.keys(STAGE_LABELS).includes(query.stage)
      ? query.stage
      : Object.entries(STAGE_LABELS).find(([, label]) => label === query.stage)?.[0]
    if (code) where.stage = code
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { role: { contains: query.search } },
      { email: { contains: query.search } },
    ]
  }
  if (query.role) where.role = { contains: query.role }

  const [items, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      skip,
      take: limit,
      orderBy: { appliedAt: 'desc' },
      include: { activities: { orderBy: { createdAt: 'desc' } } },
    }),
    prisma.candidate.count({ where }),
  ])

  const byStage = await prisma.candidate.groupBy({
    by: ['stage'],
    where: { tenantId },
    _count: { _all: true },
  })

  return {
    items: items.map(mapCandidate),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
    stats: byStage.map(row => ({
      stage: formatStage(row.stage),
      stageCode: row.stage,
      count: row._count._all,
    })),
  }
}

export async function createCandidate(prisma, tenantId, input) {
  const candidate = await prisma.candidate.create({
    data: {
      tenantId,
      name: input.name,
      role: input.role,
      stage: input.stage || 'APPLIED',
      timeInStage: input.timeInStage ?? 'Just now',
      appliedAt: parseOptionalDate(input.appliedAt) || new Date(),
      avatarUrl: input.avatarUrl ?? null,
      currentRole: input.currentRole ?? null,
      experience: input.experience ?? null,
      source: input.source ?? null,
      location: input.location ?? null,
      email: input.email ?? null,
      education: input.education ?? null,
      resumeUrl: input.resumeUrl ?? null,
    },
    include: { activities: true },
  })
  return mapCandidate(candidate)
}

export async function updateCandidateStage(prisma, tenantId, id, input) {
  const existing = await prisma.candidate.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Candidate not found')
  const candidate = await prisma.candidate.update({
    where: { id },
    data: {
      stage: input.stage,
      timeInStage: input.timeInStage ?? 'Just now',
      activities: {
        create: {
          action: `Moved to ${formatStage(input.stage)}`,
          description: `Stage updated to ${formatStage(input.stage)}`,
        },
      },
    },
    include: { activities: { orderBy: { createdAt: 'desc' } } },
  })
  return mapCandidate(candidate)
}
