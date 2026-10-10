import { csvRows } from './csv.js'

export function roadmapCsv(phases) {
  const rows = [['Phase', 'Task ID', 'Task code', 'Title', 'Status', 'Start date', 'End date', 'Progress (%)', 'Description']];
  for (const phase of phases) {
    for (const task of phase.tasks ?? []) {
      rows.push([phase.title, task.id, task.taskCode, task.title, task.statusLabel, task.startDate, task.endDate, task.progressPct, task.description]);
    }
  }
  return csvRows(rows, { bom: true });
}

export function downloadRoadmapCsv(phases) {
  const url = URL.createObjectURL(new Blob([roadmapCsv(phases)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = 'roadmap.csv';
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start the download before releasing its blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
