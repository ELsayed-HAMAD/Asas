import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate.js'
import { tenantResolver } from '../middlewares/tenantResolver.js'
import { AppError } from '../utils/errors.js'
import { parsePagination } from '../utils/pagination.js'
import { success } from '../utils/response.js'

const writeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
})

const recordDto = record => ({ ...record, data: JSON.parse(record.data) })

export function registerRecordRoutes(app, module) {
  app.addHook('preHandler', authenticate)
  app.get('/', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const { page, limit, skip } = parsePagination(request.query)
    const where = { tenantId, module }
    const [items, total] = await Promise.all([
      app.prisma.businessRecord.findMany({ where, skip, take: limit, orderBy: { updatedAt: 'desc' } }),
      app.prisma.businessRecord.count({ where }),
    ])
    return success(reply, { items: items.map(recordDto), pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  })
  app.post('/', async (request, reply) => {
    const input = writeSchema.parse(request.body)
    const record = await app.prisma.businessRecord.create({ data: { tenantId: tenantResolver(request), module, title: input.title, status: input.status, data: JSON.stringify(input.data) } })
    return success(reply, recordDto(record), 201)
  })
  app.patch('/:id', async (request, reply) => {
    const input = writeSchema.partial().parse(request.body)
    const tenantId = tenantResolver(request)
    const existing = await app.prisma.businessRecord.findFirst({ where: { id: request.params.id, tenantId, module } })
    if (!existing) throw new AppError(404, 'Record not found')
    const record = await app.prisma.businessRecord.update({ where: { id: existing.id }, data: { ...input, data: input.data === undefined ? undefined : JSON.stringify(input.data) } })
    return success(reply, recordDto(record))
  })
  app.delete('/:id', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const existing = await app.prisma.businessRecord.findFirst({ where: { id: request.params.id, tenantId, module } })
    if (!existing) throw new AppError(404, 'Record not found')
    await app.prisma.businessRecord.delete({ where: { id: existing.id } })
    return reply.code(204).send()
  })
}
