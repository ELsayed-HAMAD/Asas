import { AppError } from '../../utils/errors.js'
import { applyEnterpriseSamplePack } from './samplePack.js'

export async function getStatus(prisma, tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new AppError(404, 'Tenant not found')
  const employeeCount = await prisma.employee.count({ where: { tenantId } })
  return {
    onboardingStatus: tenant.onboardingStatus,
    hasHrData: employeeCount > 0,
    workspaceName: tenant.name,
  }
}

export async function markEmpty(prisma, tenantId) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingStatus: 'EMPTY' },
  })
  return { onboardingStatus: tenant.onboardingStatus }
}

export async function applySample(prisma, tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new AppError(404, 'Tenant not found')
  if (tenant.onboardingStatus === 'SAMPLE_LOADED') {
    throw new AppError(409, 'Sample pack was already applied to this workspace')
  }

  const summary = await applyEnterpriseSamplePack(prisma, tenantId)
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingStatus: 'SAMPLE_LOADED' },
  })
  return { onboardingStatus: updated.onboardingStatus, summary }
}

export async function importEmployees(prisma, tenantId, payload) {
  const departmentCache = new Map()

  async function resolveDepartment(name) {
    if (!name) return null
    if (departmentCache.has(name)) return departmentCache.get(name)
    const existing = await prisma.department.findFirst({ where: { tenantId, name } })
    if (existing) {
      departmentCache.set(name, existing.id)
      return existing.id
    }
    const created = await prisma.department.create({ data: { tenantId, name } })
    departmentCache.set(name, created.id)
    return created.id
  }

  const created = []
  for (const row of payload.employees) {
    const departmentId = await resolveDepartment(row.department)
    const employee = await prisma.employee.create({
      data: {
        tenantId,
        name: row.name,
        title: row.title,
        departmentId,
        status: row.status || 'ACTIVE',
        email: row.email ?? null,
        location: row.location ?? null,
        salary: row.salary ?? null,
        employeeNumber: row.employeeNumber ?? null,
        hiredAt: row.hiredAt ? new Date(row.hiredAt) : null,
      },
    })
    created.push(employee)
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingStatus: 'IMPORTED' },
  })

  return { imported: created.length, onboardingStatus: 'IMPORTED' }
}
