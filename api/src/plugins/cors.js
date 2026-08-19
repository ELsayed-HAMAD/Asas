import cors from '@fastify/cors'
import { env } from '../config/env.js'

export const corsPlugin = app => app.register(cors, {
  origin: env.frontendOrigin.split(',').map(value => value.trim()),
  credentials: true,
})
