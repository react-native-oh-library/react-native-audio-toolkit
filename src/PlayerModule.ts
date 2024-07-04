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

interface PlayInfo{
  duration: number,
  position: number
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
  set(playerId: number, option: setOptions, next: () => void): void;
  prepare(playerId: number, path: string, option: Option, next: () => void): void;
  play(playerId: number, next: () => void): void;
  pause(): void;
  playPause(): void;
  stop(): void;
  destroy(content: string): void;
  seek(): void;
  currentTime(content: string[]): void;
  wakeLock(): void;
  looping(): void;
  speed(): void;
  volume(): void;
  duration(): void;

  state(): void;
  canPlay(): void;
  canStop(): void;
  canPrepare(): void;
  isPlaying(): void;
  isStopped(): void;
  isPaused(): void;
  setListener(): void;
  removeListener(): void;
  addListener(eventName: string): void;
  removeListeners(count: Int32): void;
  getCurrentTime(playerId: number, callback:(err: string, result?: PlayInfo) => void): void
}

const RCTAudioPlayer =
  TurboModuleRegistry.getEnforcing<Spec>('RCTAudioPlayer');

export default RCTAudioPlayer;

const EVENT_NAME = 'RNCAudioPlayer_CHANGE';
const eventEmitter = new NativeEventEmitter(RCTAudioPlayer);

let listenerCount = eventEmitter.listenerCount;

// listenerCount is only available from RN 0.64
// Older versions only have `listeners`
if (!listenerCount) {
  listenerCount = (eventType: string) => {
    // @ts-ignore
    return eventEmitter.listeners(eventType).length;
  };
} else {
  listenerCount = eventEmitter.listenerCount.bind(eventEmitter);
}

const addListener = (callback: () => void): EmitterSubscription => {
  if (listenerCount(EVENT_NAME) === 0) {
    RCTAudioPlayer.setListener();
  }

  let res = eventEmitter.addListener(EVENT_NAME, callback);

  // Path the remove call to also remove the native listener
  // if we no longer have listeners
  // @ts-ignore
  res._remove = res.remove;
  res.remove = function () {
    // @ts-ignore
    this._remove();
    if (listenerCount(EVENT_NAME) === 0) {
      RCTAudioPlayer.removeListener();
    }
  };

  return res;
};

const removeAllListeners = () => {
  eventEmitter.removeAllListeners(EVENT_NAME);
  RCTAudioPlayer.removeListener();
};

export { addListener, removeAllListeners };
