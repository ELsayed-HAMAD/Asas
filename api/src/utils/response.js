export const success = (reply, data, statusCode = 200) => reply.code(statusCode).send({ data })
