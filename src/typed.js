//@ts-check

/** @template T */
export default class Typed {
  /** @param {T} value */
  constructor(value) {
    /** @type {T} */
    this.value = value;
  }
}
