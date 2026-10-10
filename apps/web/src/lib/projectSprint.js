/** The Active Sprints page should never present a completed sprint as active. */
export function selectActiveSprint(sprints = []) {
  return sprints.find(sprint => sprint.status === 'ACTIVE') ?? null
}

export function countActiveSprints(sprints = []) {
  return sprints.filter(sprint => sprint.status === 'ACTIVE').length
}
