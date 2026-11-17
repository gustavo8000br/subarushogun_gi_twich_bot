// OPS-31 P2 (AC 1-5): sends the informational `chat.notice` rows. Never part of a queue or money transition: a throw, a refusal
// of the limiter or a missing answer only retries a few times and then expires the notice (`is_sent != true` is "not delivered").
// Logs carry counts and reason codes only, never the text, a login or a display name.
import { CHAT_NOTICE_KINDS, composeChatNotice } from '../domain/chat-notice-composer.mjs';

const retryDelayMs = (attempts) => Math.min(60_000, 5_000 * Math.max(1, attempts));

/** @param {{repository: any, twitch?: any, getTwitch?: () => any, getChatCatalogs?: () => Promise<Record<string, Record<string, string>>>, clock?: () => Date, logEvent?: (event: object) => void}} dependencies */
export function createChatNoticeWorker({ repository, twitch, getTwitch, getChatCatalogs = async () => ({}), clock = () => new Date(), logEvent = () => undefined }) {
  const log = (kind, outcome, extra = {}) => { try { logEvent({ event: 'chat.notice', kind, outcome, ...extra }); } catch { /* a log sink never stops delivery */ } };
  return {
    async processOne() {
      const adapter = getTwitch?.() ?? twitch;
      if (!adapter) return 'idle';
      const task = await repository.claimNextChatNotice?.({ now: clock() });
      if (!task) return 'idle';
      const payload = task.payload ?? {};
      const kind = payload.kind;
      const definition = CHAT_NOTICE_KINDS[kind];
      const finish = (state) => repository.finishChatNotice(task.ids ?? [task.id], { ...state, leaseToken: task.leaseToken });
      // The switch is read again at send time: turning it off also stops notices already queued.
      if (!definition || !task.queue || task.queue[definition.switch] !== true) {
        await finish({ status: 'cancelled', errorCode: 'notice_switched_off' });
        log(kind, 'dropped', { reason: 'switched_off' });
        return 'cancelled';
      }
      let locale = 'pt-BR';
      try { locale = (await repository.getProductLocale?.())?.locale ?? locale; } catch { /* keep the default locale */ }
      let catalogs = {};
      try { catalogs = await getChatCatalogs(); } catch { /* the composer reports an unavailable text below */ }
      const summary = kind === 'joined' && (task.summaryCount ?? 1) > 1;
      const text = composeChatNotice({
        kind: summary ? 'joined_many' : kind, locale, catalogs,
        params: { user: payload.user, queue: task.queue.title, position: payload.position, count: summary ? task.summaryCount : payload.count },
      });
      if (!text) {
        await finish({ status: 'cancelled', errorCode: 'notice_not_composable' });
        log(kind, 'dropped', { reason: 'not_composable' });
        return 'cancelled';
      }
      const maxAttempts = Number.isInteger(payload.maxAttempts) ? payload.maxAttempts : 2;
      const expiresAt = Date.parse(payload.expiresAt ?? '');
      let result = null;
      let failure = 'chat_delivery_not_confirmed';
      try {
        result = await adapter.sendChatMessage(text, { priority: definition.priority });
        if (result?.rateLimited === true) failure = 'chat_rate_limited';
      } catch {
        failure = 'chat_send_failed';
      }
      if (result?.sent === true) {
        await finish({ status: 'confirmed' });
        log(kind, summary ? 'merged' : 'sent');
        return 'confirmed';
      }
      const now = clock();
      if (task.attempts >= maxAttempts || (Number.isFinite(expiresAt) && now.getTime() >= expiresAt)) {
        await finish({ status: 'expired', errorCode: failure });
        log(kind, 'expired', { reason: failure });
        return 'expired';
      }
      await finish({ status: 'retry', errorCode: failure, nextAttemptAt: new Date(now.getTime() + retryDelayMs(task.attempts)) });
      return 'retry';
    },
  };
}
