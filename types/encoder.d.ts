export default class Encoder {
    constructor({ circular, littleEndian, extensions, initialBufferSize, }?: {
        initialBufferSize?: number;
        circular?: boolean;
        littleEndian?: boolean;
        extensions?: Extensions;
    });
    encode: (value: any) => Uint8Array<ArrayBufferLike>;
}
import { Extensions } from './extensions.js';
