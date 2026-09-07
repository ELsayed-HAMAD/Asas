/**
 * `@asas/domain` — the single home for business calculations.
 *
 * Everything here is pure: no database, no HTTP, no framework. That is deliberate, and it is
 * what makes the numbers testable, reusable by a PDF export or a scheduled job, and impossible
 * to accidentally reimplement differently in a React render function.
 */
export * from './money/index.js'
export * from './payroll/index.js'
