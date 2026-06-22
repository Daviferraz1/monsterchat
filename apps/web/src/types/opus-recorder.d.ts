declare module 'opus-recorder' {
  interface RecorderOptions {
    encoderPath?: string;
    encoderApplication?: number;
    encoderSampleRate?: number;
    numberOfChannels?: number;
    streamPages?: boolean;
    recordingGain?: number;
    monitorGain?: number;
    [key: string]: unknown;
  }

  export default class Recorder {
    constructor(options?: RecorderOptions);
    static isRecordingSupported(): boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(): void;
    resume(): void;
    ondataavailable: ((typedArray: Uint8Array) => void) | null;
    onstart: (() => void) | null;
    onstop: (() => void) | null;
    onpause: (() => void) | null;
    onresume: (() => void) | null;
  }
}
