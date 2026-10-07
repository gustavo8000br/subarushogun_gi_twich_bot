import { createHash } from 'node:crypto';

const OVERLAY_MESSAGE_KEYS = Object.freeze([
  'overlay.state.open', 'overlay.state.closed', 'overlay.status.unavailable',
  'overlay.status.data_unavailable', 'overlay.status.stale',
]);

/** @param {{overlayRepository: Record<string, any>, queueRepository: Record<string, any>, getOverlayCatalogs?:()=>Promise<Record<string,Record<string,string>>>}} dependencies */
export function createOverlayProjectionService({ overlayRepository, queueRepository, getOverlayCatalogs = async () => ({}) }) {
  return {
    async readWithCapability(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,}$/.test(token)) return null;
      const capabilityHash = createHash('sha256').update(token, 'utf8').digest('hex');
      const projection = await overlayRepository.projectWithActiveCapability(capabilityHash, async (widget, tx) => {
        const value = widget.sourceType === 'fixed_text'
          ? widget.fixedText
          : await queueRepository.getOverlaySourceValue({ sourceType: widget.sourceType, queueId: widget.queueId, tx });
        return {
          sourceType: widget.sourceType,
          value: typeof value === 'string' || typeof value === 'number' ? value : null,
          fallbackText: widget.fallbackText,
          style: widget.style,
        };
      });
      if (!projection) return null;
      let locale = 'pt-BR';
      try { locale = (await queueRepository.getProductLocale?.())?.locale ?? locale; } catch { /* Keep the safe first-party locale when persistence is unavailable. */ }
      let catalogs = {};
      try { catalogs = await getOverlayCatalogs(); } catch { /* The widget keeps its safe built-in copy while catalogs are repaired. */ }
      const selectedCatalog = catalogs[locale] ?? catalogs['pt-BR'] ?? {};
      const messages = Object.fromEntries(OVERLAY_MESSAGE_KEYS
        .filter((key) => typeof selectedCatalog[key] === 'string')
        .map((key) => [key, selectedCatalog[key]]));
      return { ...projection, productLocale: locale, messages };
    },
  };
}
