import {
  // @ts-ignore - remove this comment when RN in the repo & example app is upgraded
  TurboModuleRegistry,
  // @ts-ignore - remove this comment when RN in the repo & example app is upgraded
  TurboModule,
  EmitterSubscription,
  NativeEventEmitter,
} from 'react-native';
// @ts-ignore - remove this comment when RN in the repo & example app is upgraded
import type { Int32 } from 'react-native/Libraries/Types/CodegenTypes';

enum PlaybackCategories {
  Playback = 1,
  Ambient = 2,
  SoloAmbient = 3
}

interface Option {
  autoDestroy: boolean;
  continuesToPlayInBackground: boolean;
  category: PlaybackCategories;
  mixWithOthers: boolean;
}
interface setOptions {
  volume: string,
  pan: string,
  wakeLock: string,
  looping: boolean,
  speed: boolean,
}

interface PlayInfo {
  duration: number,
  position: number
}

export interface Spec extends TurboModule {
  set(playerId: number, option: setOptions, next: () => void): void;
  prepare(playerId: number, path: string, option: Option, next: () => void): void;
  play(playerId: number, next: () => void): void;
  pause(): void;
  stop(): void;
  destroy(content: string): void;
  seek(): void;
  getCurrentTime(playerId: number, callback: (err: string, result?: PlayInfo) => void): void
}

const RCTAudioPlayer =
  TurboModuleRegistry.getEnforcing<Spec>('RCTAudioPlayer');

export default RCTAudioPlayer;
