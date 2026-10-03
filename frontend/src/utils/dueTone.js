const DAY_MS = 1000 * 60 * 60 * 24;

export function daysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  return Math.round((due - today) / DAY_MS);
}

export function getDueTone(dueDate, paid) {
  if (paid) return "success";
  const diff = daysUntil(dueDate);
  if (diff === null) return "neutral";
  if (diff < 0) return "danger";
  if (diff <= 7) return "warning";
  return "neutral";
}
