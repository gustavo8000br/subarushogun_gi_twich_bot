import { createHash } from 'node:crypto';

/** @param {{overlayRepository: Record<string, any>, queueRepository: Record<string, any>}} dependencies */
export function createOverlayProjectionService({ overlayRepository, queueRepository }) {
  return {
    async readWithCapability(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,}$/.test(token)) return null;
      const capabilityHash = createHash('sha256').update(token, 'utf8').digest('hex');
      return overlayRepository.projectWithActiveCapability(capabilityHash, async (widget, tx) => {
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
    },
  };
}
