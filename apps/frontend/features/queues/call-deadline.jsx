import { useEffect, useRef, useState } from 'react';
import { getCallDeadlinePresentation } from '../../../shared/panel/call-deadline-presentation.mjs';

// `now` stays null during server render and first paint so the time never causes a hydration mismatch.
export default function CallDeadline({ entry, t, onExpire = undefined }) {
  const [now, setNow] = useState(null);
  const deadline = getCallDeadlinePresentation(entry, now ?? undefined);
  const sawCountdown = useRef(false);
  const counting = Boolean(entry.callNotifiedAt && entry.callDeadlineAt) && (now === null || deadline.state === 'countdown');

  useEffect(() => {
    if (!counting) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);

  useEffect(() => {
    // Announce only a transition this mount actually watched; an entry that is already expired on arrival stays silent.
    if (deadline.state === 'countdown') sawCountdown.current = true;
    else if (deadline.state === 'expired' && sawCountdown.current) {
      sawCountdown.current = false;
      onExpire?.(entry);
    }
  }, [deadline.state, entry, onExpire]);

  if (counting && now === null) return <small className="call-deadline call-deadline-countdown" />;
  return <small className={`call-deadline call-deadline-${deadline.state}`}>{t(deadline.key, { values: deadline.values })}</small>;
}
