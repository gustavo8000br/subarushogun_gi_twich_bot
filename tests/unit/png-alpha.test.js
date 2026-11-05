import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeRgbaPng } from '../helpers/png-alpha.mjs';

function crc(buffer) {
  let c; let value = 0xffffffff;
  for (const byte of buffer) { c = (value ^ byte) & 0xff; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; value = (value >>> 8) ^ c; }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const head = Buffer.alloc(4); head.writeUInt32BE(body.length);
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([head, Buffer.from(type), body, tail]);
}
function png(width, height, rows) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

describe('decodeRgbaPng', () => {
  it('reads alpha through the None and Sub filters', () => {
    const image = decodeRgbaPng(png(2, 2, [
      Buffer.from([0, 255, 255, 255, 0, 255, 255, 255, 200]),
      Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 90]),
    ]));
    expect([image.width, image.height]).toEqual([2, 2]);
    expect(image.alphaAt(0, 0)).toBe(0);
    expect(image.alphaAt(1, 0)).toBe(200);
    expect(image.alphaAt(0, 1)).toBe(0);
    expect(image.alphaAt(1, 1)).toBe(90);
  });

  it('rejects data that is not an RGBA PNG', () => {
    expect(() => decodeRgbaPng(Buffer.from('nope'))).toThrow('not a PNG');
  });
});
