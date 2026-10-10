import test from 'node:test'
import assert from 'node:assert/strict'
import { countActiveSprints, selectActiveSprint } from '../src/lib/projectSprint.js'

test('selects an active sprint when active and completed sprints are present', () => {
  const active = { id: 'active', status: 'ACTIVE' }
  const completed = { id: 'completed', status: 'COMPLETED' }

  assert.equal(selectActiveSprint([completed, active]), active)
})

test('does not treat a completed sprint as active when no active sprint exists', () => {
  assert.equal(selectActiveSprint([{ id: 'completed', status: 'COMPLETED' }]), null)
  assert.equal(selectActiveSprint([]), null)
})

test('counts only active sprints in the dashboard KPI', () => {
  assert.equal(countActiveSprints([
    { id: 'active-1', status: 'ACTIVE' },
    { id: 'completed', status: 'COMPLETED' },
    { id: 'planned', status: 'PLANNING' },
    { id: 'active-2', status: 'ACTIVE' },
  ]), 2)
  assert.equal(countActiveSprints([]), 0)
})
