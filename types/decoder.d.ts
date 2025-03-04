export default class Decoder {
    /** @param {DecoderOptions} options */
    constructor({ circular, littleEndian, extensions, }?: DecoderOptions);
    decode: (view: ArrayBufferView) => any;
}
export type DecoderOptions = {
    circular?: boolean;
    littleEndian?: boolean;
    extensions?: Extensions;
};
import { Extensions } from './extensions.js';
