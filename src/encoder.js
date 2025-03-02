//@ts-check

import { MagicView, BetterView } from '@webreflection/magic-view';

import { EXT_CIRCULAR } from './builtins.js';

const { isArray } = Array;
const { isView } = ArrayBuffer;
const { isSafeInteger } = Number;
const { entries } = Object;

const minimumBufferSize = 0xFFFF;
const textEncoder = new TextEncoder;

/** @template T */
class Typed {
  /** @param {T} value */
  constructor(value) {
    /** @type {T} */
    this.value = value;
  }
}

/**
 * @param {object} options
 * @returns
 */
export default function ({
  circular = true,
  littleEndian = false,
  extensions = new Map,
  initialBufferSize = minimumBufferSize,
} = { initialBufferSize: minimumBufferSize }) {
  const cache = /** @type {Map<any,Typed>} */(new Map);
  const mv = new MagicView(initialBufferSize);
  const bv = new BetterView(new ArrayBuffer(18));

  /** @param {any[]} value */
  const array = value => {
    const size = mv.size;
    const length = value.length;
    if (length < 16)
      mv.setU8(size, 0x90 + length);
    else if (length < 0x10000) {
      mv.setU8(size, 0xdc);
      mv.setUint16(size + 1, length, littleEndian);
    }
    else {
      mv.setU8(size, 0xdd);
      mv.setUint32(size + 1, length, littleEndian);
    }
    let typed;
    if (circular) typed = circle(value, size);
    for (let i = 0; i < length; i++) encode(value[i], true);
    //@ts-ignore and seriously: WTF!
    if (circular) typed.value = mv.getTyped(size, mv.size);
  };

  /** @param {any} value */
  const encode = (value, nullify = false) => {
    switch (typeof value) {
      case 'boolean': {
        mv.setU8(mv.size, value ? 0xc3 : 0xc2);
        break;
      }
      case 'number': {
        num(value);
        break;
      }
      case 'string': {
        str(value);
        break;
      }
      case 'bigint': {
        if (value >= 0n) {
          mv.setU8(mv.size, 0xcf);
          mv.setBigUint64(mv.size, value, littleEndian);
        }
        else {
          mv.setU8(mv.size, 0xd3);
          mv.setBigInt64(mv.size, value, littleEndian);
        }
        break;
      }
      case 'object': {
        if (value === null) nil();
        else if (notCached(value)) {
          // TODO extensions in here
          if (isArray(value)) array(value);
          else if (isView(value)) view(value);
          else object(value);
        }
        break;
      }
      default: {
        if (nullify) nil();
        break;
      }
    }
  };

  const nil = () => {
    mv.setU8(mv.size, 0xc0);
  };

  /** @param {any} value */
  const notCached = value => {
    const typed = cache.get(value);
    if (typed) {
      mv.setTypedU8(mv.size, typed.value);
      return false;
    }
    return true;
  };

  /** @param {number} value */
  const num = value => {
    const size = mv.size;
    if (isSafeInteger(value)) {
      if (value >= 0) {
        if (value < 0x80)
          mv.setU8(size, value);
        else if (value < 0x100)
          mv.setArray(size, [0xcc, value]);
        else if (value < 0x10000) {
          mv.setU8(size, 0xcd);
          mv.setUint16(size + 1, value, littleEndian);
        }
        else if (value < 0x100000000) {
          mv.setU8(size, 0xce);
          mv.setUint32(size + 1, value, littleEndian);
        }
        else {
          mv.setU8(size, 0xcb);
          mv.setFloat64(size + 1, value, littleEndian);
        }
      }
      else {
        if (value >= -0x20)
          mv.setU8(size, 0xe0 | (value + 0x20));
        else if (value >= -0x80) {
          mv.setU8(size, 0xd0);
          mv.setInt8(size + 1, value);
        }
        else if (value >= -0x8000) {
          mv.setU8(size, 0xd1);
          mv.setInt16(size + 1, value, littleEndian);
        }
        else if (value >= -0x80000000) {
          mv.setU8(size, 0xd2);
          mv.setInt32(size + 1, value, littleEndian);
        }
        else {
          mv.setU8(size, 0xcb);
          mv.setFloat64(size + 1, value, littleEndian);
        }
      }
    }
    else {
      mv.setU8(size, 0xcb);
      mv.setFloat64(size + 1, value, littleEndian);
    }
  };

  /** @param {object} value */
  const object = value => {
    const size = mv.size;
    const pairs = entries(value);
    const encoded = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      switch (typeof pair[1]) {
        case 'function':
        case 'symbol':
        case 'undefined':
          break;
        default:
          encoded.push(pair);
          break;
      }
    }
    const length = encoded.length;
    if (length < 16)
      mv.setU8(size, 0x80 + length);
    else if (length < 0x10000) {
      mv.setU8(size, 0xde);
      mv.setUint16(size + 1, length, littleEndian);
    } else {
      mv.setU8(size, 0xdf);
      mv.setUint32(size + 1, length, littleEndian);
    }
    let typed;
    if (circular) typed = circle(value, size);
    for (let i = 0; i < length; i++) {
      const [key, value] = encoded[i];
      str(key);
      encode(value);
    }
    //@ts-ignore and seriously: WTF!
    if (circular) typed.value = mv.getTyped(size, mv.size);
  };

  /**
   * @param {any} value
   * @param {number} index
   * @returns
   */
  const circle = (value, index) => {
    let size = 0;
    bv.setInt8(1, EXT_CIRCULAR);
    if (index < 0x100) {
      bv.setUint8(0, 0xd4);
      bv.setUint8(2, index);
      size = 3;
    }
    else if (index < 0x10000) {
      bv.setUint8(0, 0xd5);
      bv.setUint16(2, index, littleEndian);
      size = 4;
    }
    else {
      bv.setUint8(0, 0xd6);
      bv.setUint32(2, index, littleEndian);
      size = 6;
    }

    const typed = new Typed(bv.getTyped(0, size));
    cache.set(value, typed);
    return typed;
  };

  /** @param {string} value */
  const str = value => {
    const ui8a = textEncoder.encode(value);
    const length = ui8a.length;
    let size = mv.size;
    if (length < 32)
      mv.setU8(size++, 0xa0 + length);
    else if (length < 0x100) {
      mv.setArray(size, [0xd9, length]);
      size += 2;
    }
    else if (length < 0x10000) {
      mv.setU8(size, 0xda);
      mv.setUint16(size + 1, length, littleEndian);
      size += 3;
    }
    else {
      mv.setU8(size, 0xdb);
      mv.setUint32(size + 1, length, littleEndian);
      size += 5;
    }
    mv.setTypedU8(size, ui8a);
  };

  /** @param {ArrayBufferView} value */
  const view = value => {
    let typed, size = mv.size, rsize = size;
    const byteLength = value.byteLength;
    if (circular) typed = circle(value, size);
    if (byteLength < 0x100) {
      mv.setArray(size, [0xc4, byteLength]);
      size += 2;
    }
    else if (byteLength < 0x10000) {
      mv.setU8(size, 0xc5);
      mv.setUint16(size + 1, byteLength, littleEndian);
      size += 3;
    }
    else {
      mv.setU8(size, 0xc6);
      mv.setUint32(size + 1, byteLength, littleEndian);
      size += 5;
    }
    mv.setTyped(size, value);
    //@ts-ignore and seriously: WTF!
    if (circular) typed.value = mv.getTyped(rsize, mv.size);
  };

  /**
   * @param {any} value
   * @returns
   */
  return value => {
    encode(value);
    cache.clear();
    return mv.view;
  };
};
