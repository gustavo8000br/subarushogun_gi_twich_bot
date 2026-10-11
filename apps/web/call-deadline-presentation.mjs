function formatRemaining(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** @param {{ callNotifiedAt?: string | Date | null, callDeadlineAt?: string | Date | null }} entry @param {number} [now] */
export function getCallDeadlinePresentation(entry, now = Date.now()) {
  if (!entry.callNotifiedAt) {
    return { key: 'panel.entry.call.awaiting_delivery', values: {}, state: 'awaiting_delivery' };
  }
  if (!entry.callDeadlineAt) {
    return { key: 'panel.entry.call.no_deadline', values: {}, state: 'no_deadline' };
  }

  const remaining = new Date(entry.callDeadlineAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { key: 'panel.entry.call.expired', values: {}, state: 'expired' };
  }
  return { key: 'panel.entry.call.remaining', values: { time: formatRemaining(remaining) }, state: 'countdown' };
}
