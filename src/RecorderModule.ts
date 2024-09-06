import {
  // @ts-ignore - remove this comment when RN in the repo & example app is upgraded
  TurboModuleRegistry,
  // @ts-ignore - remove this comment when RN in the repo & example app is upgraded
  TurboModule,
} from 'react-native';
// @ts-ignore - remove this comment when RN in the repo & example app is upgraded
import type { Int32 } from 'react-native/Libraries/Types/CodegenTypes';

interface RecorderOptions {
  /**
   * Set bitrate for the recorder, in bits per second (Default: 128000)
   */
  bitrate: number;

  /**
   * Set number of channels (Default: 2)
   */
  channels: number;

  /**
   * Set how many samples per second (Default: 44100)
   */
  sampleRate: number;

  /**
   * Override format. Possible values:
   *   - Cross-platform:  'mp4', 'aac'
   *   - Android only:    'ogg', 'webm', 'amr'
   * 
   * (Default: based on filename extension)
   */
  format: string;

  /**
   * Override encoder. Android only.
   * 
   * Possible values: 'aac', 'mp4', 'webm', 'ogg', 'amr'
   * 
   * (Default: based on filename extension)
   */
  encoder: string;

  /**
   * Quality of the recording, iOS only.
   * 
   * Possible values: 'min', 'low', 'medium', 'high', 'max'
   * 
   * (Default: 'medium')
   */
  quality: string;
}

interface Event {
  event: string;
  data: string | null | undefined;
}

export interface Spec extends TurboModule {
  /**
   * Get content of string type, this method returns a `Promise`, so you can use following code to get clipboard content
   * ```javascript
   * async _getContent() {
   *   var content = await Clipboard.getString();
   * }
   * ```
   */
  // 准备
  prepare(recorderId: number, path: string, option: RecorderOptions, next: () => void): void;
  // 开始
  record(recorderId: number, next: () => void): void;
  // 停止
  stop(recorderId: number, next: () => void): void;
  // 暂停
  pause(recorderId: number, next: () => void): void;
  // 销毁
  destroy(recorderId: number, next: () => void): void;
}

const RCTAudioRecorder =
  TurboModuleRegistry.getEnforcing<Spec>('RCTAudioRecorder');

export default RCTAudioRecorder;
