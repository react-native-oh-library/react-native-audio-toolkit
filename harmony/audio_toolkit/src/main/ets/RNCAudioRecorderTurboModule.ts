/**
 * MIT License
 *
 * Copyright (C) 2024 Huawei Device Co., Ltd.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { TurboModule, type TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { type TM } from '@rnoh/react-native-openharmony/generated/ts';
import { type BusinessError } from '@ohos.base';
import media from '@ohos.multimedia.media';
import fs from '@ohos.file.fs';
import abilityAccessCtrl, { type Permissions } from '@ohos.abilityAccessCtrl';
import picker from '@ohos.file.picker';
import logger from './Logger';

const TAG = 'RCTAudioRecorderTurboModule';

const PERMISSIONS: Array<Permissions> = [
  'ohos.permission.MICROPHONE',
];

interface Error {
  err?: string;
  message?: string;
}

export class RCTAudioRecorderTurboModule extends TurboModule {
  private _file: fs.File;
  // 音频参数
  private avRecorder: media.AVRecorder | undefined = undefined;
  private avProfile: media.AVRecorderProfile;
  private avConfig: media.AVRecorderConfig;
  private readonly AUDIOBITRATE_DEFAULT = 48000;
  private readonly AUDIOCHANNELS_DEFAULT = 2;
  private readonly AUDIOSAMPLERATE = 48000;
  private readonly FD_PATH = 'fd://';

  constructor(protected ctx: TurboModuleContext) {
    super(ctx);
    this.ctx = ctx;
  }

  // 注册audioRecorder回调函数
  setAudioRecorderCallback(recorderId: number): void {
    if (this.avRecorder !== undefined) {
      // 状态机变化回调函数
      this.avRecorder.on('stateChange', (state: media.AVRecorderState, reason: media.StateChangeReason) => {
        this.toEmit(recorderId, 'info', {
          event: 'info',
          data: {
            info: {
              what: state,
              extra: reason,
            },
          },
        });
      });
      // 错误上报回调函数
      this.avRecorder.on('error', (err: BusinessError) => {
        this.toEmit(recorderId, 'error', {
          event: 'err',
          message: 'harmony MediaRecorder error',
        });
      });
    }
  }

  emit(name: string, data: object): void {
    this.ctx.rnInstance.emitDeviceEvent(name, data);
  }

  toEmit(recorderId: number, name: string, data: object): void {
    this.emit(`RCTAudioRecorderEvent:${recorderId}`, { event: name, data });
  }

  // 开始录制对应的流程
  async startRecordingProcess(path: string, next: (object?, fsPath?: string) => void,
    preparingCall?: (object?) => void): Promise<void> {
    try {
      let audioSaveOptions = new picker.AudioSaveOptions();
      audioSaveOptions.newFileNames = [path];
      let audioPicker = new picker.AudioViewPicker();

      audioPicker.save(audioSaveOptions, async (err: BusinessError, audioSaveResult: Array<string>) => {
        if (err || !audioSaveResult || audioSaveResult.length === 0) {
          next(null);
          return;
        }
        preparingCall(null);
        this._file = fs.openSync(audioSaveResult[0], fs.OpenMode.READ_WRITE);
        this.avConfig.url = this.FD_PATH + this._file.fd;
        this.requestPermission().then(async res => {
          if (res) {
            await this.avRecorder.prepare(this.avConfig);
            await this.avRecorder.start();
            next(null, audioSaveResult[0]);
          } else {
            next(null);
          }
        });
      });
    } catch (error) {
      next(null);
    }
  }

  // 以下demo为使用fs文件系统打开沙箱地址获取媒体文件地址并通过url属性进行播放示例
  async prepare(recorderId: number, path: string, option: TM.RCTAudioRecorder.RecorderOptions
    , next: (object?, fsPath?: string) => void, preparingCall?: (object?) => void): Promise<void> {
    if (path === null || path === undefined) {
      next({
        err: 'invalidpath',
        stackTrace: 'Exception occurred while parsing stack trace',
        message: 'Provided path was empty',
      });
      return;
    }
    if (this.avRecorder !== undefined) {
      await this.avRecorder.release();
      this.avRecorder = undefined;
    }
    // 1.创建录制实例
    this.avRecorder = await media.createAVRecorder();
    this.setAudioRecorderCallback(recorderId);
    this.avProfile = {
      audioBitrate: option.bitRate ?? this.AUDIOBITRATE_DEFAULT, // 音频比特率
      audioChannels: option.channels ?? this.AUDIOCHANNELS_DEFAULT, // 音频声道数
      audioCodec: media.CodecMimeType.AUDIO_AAC, // 音频编码格式，当前只支持aac
      audioSampleRate: option.sampleRate ?? this.AUDIOSAMPLERATE, // 音频采样率
      fileFormat: media.ContainerFormatType.CFT_MPEG_4A, // 封装格式，当前只支持m4a
    };
    this.avConfig = {
      audioSourceType: media.AudioSourceType.AUDIO_SOURCE_TYPE_MIC, // 音频输入源，这里设置为麦克风
      profile: this.avProfile,
      url: '', // 参考应用文件访问与管理开发示例新建并读写一个文件
    };
    await this.startRecordingProcess(path, next, preparingCall);
  }

  async record(recorderId: number, next: (object?) => void): Promise<void> {
    if (this.avRecorder !== undefined) {
      this.avRecorder.resume();
      next();
    } else {
      next({ code: 'notfound', recorderId: `${recorderId}not found.` });
    }
  }

  async pause(recorderId: number, next: () => void): Promise<void> {
    if (this.avRecorder !== undefined) {
      // 1. 停止录制
      if (this.avRecorder.state === 'started') { // 仅在started状态下调用started为合理状态切换
        await this.avRecorder.pause();
      }
    }
    next();
  }

  /**
   * Get clipboard image as JPG in base64, this method returns a `Promise`, so you can use following code to get clipboard content
   * ```javascript
   * async _getContent() {
   *   var content = await Clipboard.getImageJPG();
   * }
   * ```
   */

  // 停止录制对应的流程
  async stop(recorderId: number, next: (object?) => void): Promise<void> {
    if (this.avRecorder !== undefined) {
      // 1. 停止录制
      if (this.avRecorder.state === 'started' ||
        this.avRecorder.state === 'paused') { // 仅在started或者paused状态下调用stop为合理状态切换
        await this.avRecorder.stop();
      }
      next();
    } else {
      next({ code: 'notfound', recorderId: `${recorderId}not found.` });
    }
  }

  /**
   * (iOS Only)
   * Set content of base64 image type. You can use following code to set clipboard content
   * ```javascript
   * _setContent() {
   *   Clipboard.setImage(...);
   * }
   * ```
   * @param the content to be stored in the clipboard.
   */
  async destroy(recorderId: number, next: (object?) => void): Promise<void> {
    if (this.avRecorder !== undefined) {
      if (this.avRecorder.state === 'stopped') {
        // 2.重置
        await this.avRecorder.reset();
        // 3.释放录制实例
        await this.avRecorder.release();

        // 4.关闭录制文件fd
        fs.close(this._file);
        this.toEmit(recorderId, 'info', {
          message: 'Destroyed recorder',
        });
      }
    }
    logger.debug(TAG, 'RCTAudioRecorderTurboModule destroy');
  }


  requestPermission(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      abilityAccessCtrl.createAtManager()
        .requestPermissionsFromUser(this.ctx.uiAbilityContext, PERMISSIONS).then(result => {
        if (result.authResults[0] === 0) {
          resolve(true);
        } else {
          logger.debug(TAG, `getString,text out:用户拒绝授权`);
          resolve(false);
        }
      }).catch(() => {
        logger.debug(TAG, `getString,text out:用户拒绝授权`);
        resolve(false);
      });
    });
  }
}