//@ts-check

import { stringBytes } from '@webreflection/magic-view';

const encoder = new TextEncoder;

class MV {
  constructor(i) {
    const b = new ArrayBuffer(2 ** 24);
    this.d = new DataView(b);
    this.v = new Uint8Array(b);
    this.i = i;
  }
  get byteLength() { return this.i }
  get view() {
    const v = this.v.slice(0, this.i);
    this.i = 0;
    return v;
  }
  setString(value, bytes = stringBytes(value)) {
    encoder.encodeInto(value, this.v.subarray(this.i, this.i + bytes));
    this.i += bytes;
  }
  setInt8(value) {
    this.d.setInt8(this.i++, value);
  }
  setUint8(value) {
    this.d.setUint8(this.i++, value);
  }
  setFloat16(value, littleEndian) {
    //@ts-ignore
    this.d.setFloat16(this.i, value, littleEndian);
    this.i += 2;
  }
  setInt16(value, littleEndian) {
    this.d.setInt16(this.i, value, littleEndian);
    this.i += 2;
  }
  setUint16(value, littleEndian) {
    this.d.setUint16(this.i, value, littleEndian);
    this.i += 2;
  }
  setFloat32(value, littleEndian) {
    this.d.setFloat32(this.i, value, littleEndian);
    this.i += 4;
  }
  setInt32(value, littleEndian) {
    this.d.setInt32(this.i, value, littleEndian);
    this.i += 4;
  }
  setUint32(value, littleEndian) {
    this.d.setUint32(this.i, value, littleEndian);
    this.i += 4;
  }
  setBigInt64(value, littleEndian) {
    this.d.setBigInt64(this.i, value, littleEndian);
    this.i += 8;
  }
  setBigUint64(value, littleEndian) {
    this.d.setBigUint64(this.i, value, littleEndian);
    this.i += 8;
  }
  setFloat64(value, littleEndian) {
    this.d.setFloat64(this.i, value, littleEndian);
    this.i += 8;
  }
  setManyU8(...values) {
    const length = values.length;
    for (let j = 0; j < length; j++) this.v[this.i++] = values[j];
  }
  setU8(value) {
    this.v[this.i++] = value;
  }
  setTyped(typed) {
    this.setTypedU8(typed instanceof Uint8Array ? typed : new Uint8Array(typed.buffer));
  }
  setTypedU8(ui8a) {
    this.v.set(ui8a, this.i);
    this.i += ui8a.length;
  }
}

export function MagicView(initialBufferSize) {
  return new MV(0);
  // const b = new ArrayBuffer(2 ** 24);
  // const d = new DataView(b);
  // const v = new Uint8Array(b);
  // let i = 0;
  // return {
  //   get byteLength() { return i },
  //   get view() {
  //     const $ = v.slice(0, i);
  //     i = 0;
  //     return $;
  //   },
  //   setString(value, bytes = stringBytes(value)) {
  //     encoder.encodeInto(value, v.subarray(i, i + bytes));
  //     i += bytes;
  //   },
  //   setInt8(value) {
  //     d.setInt8(i, value);
  //     i++;
  //   },
  //   setUint8(value) {
  //     d.setUint8(i, value);
  //     i++;
  //   },
  //   setFloat16(value, littleEndian) {
  //     //@ts-ignore
  //     d.setFloat16(i, value, littleEndian);
  //     i += 2;
  //   },
  //   setInt16(value, littleEndian) {
  //     d.setInt16(i, value, littleEndian);
  //     i += 2;
  //   },
  //   setUint16(value, littleEndian) {
  //     d.setUint16(i, value, littleEndian);
  //     i += 2;
  //   },
  //   setFloat32(value, littleEndian) {
  //     d.setFloat32(i, value, littleEndian);
  //     i += 4;
  //   },
  //   setInt32(value, littleEndian) {
  //     d.setInt32(i, value, littleEndian);
  //     i += 4;
  //   },
  //   setUint32(value, littleEndian) {
  //     d.setUint32(i, value, littleEndian);
  //     i += 4;
  //   },
  //   setBigInt64(value, littleEndian) {
  //     d.setBigInt64(i, value, littleEndian);
  //     i += 8;
  //   },
  //   setBigUint64(value, littleEndian) {
  //     d.setBigUint64(i, value, littleEndian);
  //     i += 8;
  //   },
  //   setFloat64(value, littleEndian) {
  //     d.setFloat64(i, value, littleEndian);
  //     i += 8;
  //   },
  //   setManyU8(...values) {
  //     const length = values.length;
  //     for (let j = 0; j < length; j++) v[i++] = values[j];
  //   },
  //   setU8(value) {
  //     v[i++] = value;
  //   },
  //   setTyped(typed) {
  //     this.setTypedU8(typed instanceof Uint8Array ? typed : new Uint8Array(typed.buffer));
  //   },
  //   setTypedU8(ui8a) {
  //     v.set(ui8a, i);
  //     i += ui8a.length;
  //   },
  // };
};
