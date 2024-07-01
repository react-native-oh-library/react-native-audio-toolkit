import { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { TM } from "@rnoh/react-native-openharmony/generated/ts"
import { BusinessError } from '@ohos.base';
import media from '@ohos.multimedia.media';
import common from '@ohos.app.ability.common';
import fs from '@ohos.file.fs';

import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';

import picker from '@ohos.file.picker';

import logger from './Logger';
import { JSON } from '@kit.ArkTS';

const TAG = "RCTAudioPlayerTurboModule"

const PERMISSIONS: Array<Permissions> = [
  'ohos.permission.MICROPHONE'
]


let bufferSize: number = 0;
class Options {
  offset?: number;
  length?: number;
}
// class i
export class RCTAudioPlayerTurboModule extends TurboModule {
  private count: number = 0;
  private isSeek: boolean = true; // 用于区分模式是否支持seek操作
  private aaa: fs.File;
  // 音频参数
  private avRecorder: media.AVRecorder | undefined = undefined;
  private avProfile: media.AVRecorderProfile = {
    audioBitrate: 100000, // 音频比特率
    audioChannels: 2, // 音频声道数
    audioCodec: media.CodecMimeType.AUDIO_AAC, // 音频编码格式，当前只支持aac
    audioSampleRate: 48000, // 音频采样率
    fileFormat: media.ContainerFormatType.CFT_MPEG_4A, // 封装格式，当前只支持m4a
  };
  private avConfig: media.AVRecorderConfig = {
    audioSourceType: media.AudioSourceType.AUDIO_SOURCE_TYPE_MIC, // 音频输入源，这里设置为麦克风
    profile: this.avProfile,
    url: 'fd://35', // 参考应用文件访问与管理开发示例新建并读写一个文件
  };


  constructor(protected ctx: TurboModuleContext) {
    super(ctx);
    this.ctx = ctx
  }

  // 注册audioRecorder回调函数
  setAudioRecorderCallback() {
    if (this.avRecorder != undefined) {
      // 状态机变化回调函数
      this.avRecorder.on('stateChange', (state: media.AVRecorderState, reason: media.StateChangeReason) => {
        console.log(`aaaaaaaAudioRecorder current state is ${state}`);
      })
      // 错误上报回调函数
      this.avRecorder.on('error', (err: BusinessError) => {
        console.error(`aaaaaaaaaaAudioRecorder failed, code is ${err.code}, message is ${err.message}`);
      })
    }
  }
  readDataCallback(buffer: ArrayBuffer) {
    let options: Options = {
      offset: bufferSize,
      length: buffer.byteLength
    }
    fs.writeSync(this.aaa.fd, buffer, options);
    bufferSize += buffer.byteLength;
  }

  // 开始录制对应的流程
  async startRecordingProcess() {
    if (this.avRecorder != undefined) {
      await this.avRecorder.release();
      this.avRecorder = undefined;
    }
    // 1.创建录制实例
    this.avRecorder = await media.createAVRecorder();
    this.setAudioRecorderCallback();

    try {
      let audioSaveOptions = new picker.AudioSaveOptions();
      audioSaveOptions.newFileNames = ['AudioViewPic.mp3'];
      let audioPicker = new picker.AudioViewPicker();

      audioPicker.save(audioSaveOptions,async  (err: BusinessError, audioSaveResult: Array<string>) => {
        if (err) {
          console.error('AudioViewPicker.save failed with err: ' + JSON.stringify(err));
          return;
        }
        this.aaa = fs.openSync(audioSaveResult[0], fs.OpenMode.READ_WRITE)
        this.avConfig.url = `fd://` + this.aaa.fd
        this.requestPermission().then(async res => {
          if (res) {
            await this.avRecorder.prepare(this.avConfig);
            await this.avRecorder.start();
          }
        })
        // // 4.开始录制
      });
      this.avRecorder.on('audioCapturerChange', () => {
        console.log('aaaaaaaaaaaaaaaaaachange')
      })
    } catch (error) {
      let err: BusinessError = error as BusinessError;
      console.error('AudioViewPicker failed with err: ' + JSON.stringify(err));
    }
  }

  setAVPlayerCallback(avPlayer: media.AVPlayer) {
    // seek操作结果回调函数
    avPlayer.on('seekDone', (seekDoneTime: number) => {
      console.info(`AVPlayer seek succeeded, seek time is ${seekDoneTime}`);
    })
    // error回调监听函数,当avPlayer在操作过程中出现错误时调用 reset接口触发重置流程
    avPlayer.on('error', (err: BusinessError) => {
      console.error(`Invoke avPlayer failed, code is ${err.code}, message is ${err.message}`);
      avPlayer.reset(); // 调用reset重置资源，触发idle状态
    })
    // 状态机变化回调函数
    avPlayer.on('stateChange', async (state: string, reason: media.StateChangeReason) => {
      switch (state) {
        case 'idle': // 成功调用reset接口后触发该状态机上报
          console.info('aaaaaaaaAVPlayer state idle called.');
          avPlayer.release(); // 调用release接口销毁实例对象
          break;
        case 'initialized': // avplayer 设置播放源后触发该状态上报
          console.info('aaaaaaaAVPlayer state initialized called.');
          avPlayer.prepare();
          break;
        case 'prepared': // prepare调用成功后上报该状态机
          console.info('aaaaaaaaaAVPlayer state prepared called.');
          avPlayer.play(); // 调用播放接口开始播放
          break;
        case 'playing': // play成功调用后触发该状态机上报
          console.info('aaaaaaaaaAVPlayer state playing called.');
          if (this.count !== 0) {
            if (this.isSeek) {
              console.info('aaaaaAVPlayer start to seek.');
              avPlayer.seek(avPlayer.duration); //seek到音频末尾
            } else {
              // 当播放模式不支持seek操作时继续播放到结尾
              console.info('aaaaaaaaaAVPlayer wait to play end.');
            }
          } else {
            avPlayer.pause(); // 调用暂停接口暂停播放
          }
          this.count++;
          break;
        case 'paused': // pause成功调用后触发该状态机上报
          console.info('aaaaaaaAVPlayer state paused called.');
          avPlayer.play(); // 再次播放接口开始播放
          break;
        case 'completed': // 播放结束后触发该状态机上报
          console.info('aaaaaaAVPlayer state completed called.');
          avPlayer.stop(); //调用播放结束接口
          break;
        case 'stopped': // stop接口成功调用后触发该状态机上报
          console.info('aaaaaaaAVPlayer state stopped called.');
          avPlayer.reset(); // 调用reset接口初始化avplayer状态
          break;
        case 'released':
          console.info('aaaaaaaAaVPlayer state released called.');
          break;
        default:
          console.info('aaaaaaaAVPlayer state unknown called.');
          break;
      }
    })
  }

  // 以下demo为使用fs文件系统打开沙箱地址获取媒体文件地址并通过url属性进行播放示例
  async _avPlayerUrlDemo(pathstr: string) {
    // 创建avPlayer实例对象
    let avPlayer: media.AVPlayer = await media.createAVPlayer();
    // 创建状态机变化回调函数
    this.setAVPlayerCallback(avPlayer);
    let fdPath = 'fd://';
    // 通过UIAbilityContext获取沙箱地址filesDir，以Stage模型为例
    let context = this.ctx.uiAbilityContext as common.UIAbilityContext;
    let path = context.filesDir + pathstr;
    // 打开相应的资源文件地址获取fd，并为url赋值触发initialized状态机上报
    let file = await fs.open(path);
    fdPath = fdPath + '' + file.fd;
    this.isSeek = true; // 支持seek操作
    avPlayer.url = fdPath;
  }

  prepare(playerId: number, path: string, option: TM.RCTAudioPlayer.Option, next: () => void) {
    this._avPlayerUrlDemo(path).then(() => {
      next()
    })
  }

  async play() {
    await this.startRecordingProcess();
  }

  pause() {
  }
  /**
   * Get clipboard image as PNG in base64, this method returns a `Promise`, so you can use following code to get clipboard content
   * ```javascript
   * async _getContent() {
   *   var content = await Clipboard.getImagePNG();
   * }
   * ```
   */
  playPause() {
    logger.debug(TAG, "aaaaaaaaRCTAudioPlayerTurboModule play");
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
  async stopRecordingProcess() {
    if (this.avRecorder != undefined) {
      // 1. 停止录制
      if (this.avRecorder.state === 'started'
        || this.avRecorder.state === 'paused') { // 仅在started或者paused状态下调用stop为合理状态切换
        await this.avRecorder.stop();
      }
      // 2.重置
      await this.avRecorder.reset();
      // 3.释放录制实例
      await this.avRecorder.release();
      this.avRecorder = undefined;
      // 4.关闭录制文件fd
      fs.close(this.aaa);
    }
  }

  async stop() {
    console.log('aaaaaaastop')
    await this.stopRecordingProcess();
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
  destroy() {
    logger.debug(TAG, "aaaaaaaaRCTAudioPlayer1TurboModule play");
  }
  /**
   * (Android Only)
   * Get clipboard image in base64, this method returns a `Promise`, so you can use following code to get clipboard content
   * ```javascript
   * async _getContent() {
   *   var content = await Clipboard.getImage();
   * }
   * ```
   */
  seek() {
    this.isSeek  = false;
    // logger.debug(TAG, "aaaaaaaaRCTAudioPlayer1TurboModule play");
  }
  /**
   * Set content of string type. You can use following code to set clipboard content
   * ```javascript
   * _setContent() {
   *   Clipboard.setString('hello world');
   * }
   * ```
   * @param the content to be stored in the clipboard.
   */
  volume() {
    logger.debug(TAG, "aaaaaaaaRCTAudioPlayer1TurboModule play");
  }
  /**
   * Set content of string array type. You can use following code to set clipboard content
   * ```javascript
   * _setContent() {
   *   Clipboard.setStrings(['hello world', 'second string']);
   * }
   * ```
   * @param the content to be stored in the clipboard.
   */
  currentTime() {
    logger.debug(TAG, "aaaaaaaaRCTAudioPlayer1TurboModule play");
  }
  /**
   * Returns whether the clipboard has content or is empty.
   * This method returns a `Promise`, so you can use following code to get clipboard content
   * ```javascript
   * async _hasContent() {
   *   var hasContent = await Clipboard.hasString();
   * }
   * ```
   */
  wakeLock() {
    logger.debug(TAG, "aaaaaaaaRCTAudioPlayer1TurboModule play");
  }
  /**
   * Returns whether the clipboard has an image or is empty.
   * This method returns a `Promise`, so you can use following code to check clipboard content
   * ```javascript
   * async _hasContent() {
   *   var hasContent = await Clipboard.hasImage();
   * }
   * ```
   */
  looping() {
    logger.debug(TAG, "aaaaaaaaRCTAudioPlayer1TurboModule play");
  }
  /**
   * (iOS Only)
   * Returns whether the clipboard has a URL content. Can check
   * if there is a URL content in clipboard without triggering PasteBoard notification for iOS 14+
   * This method returns a `Promise`, so you can use following code to check for url content in clipboard.
   * ```javascript
   * async _hasURL() {
   *   var hasURL = await Clipboard.hasURL();
   * }
   * ```
   */
  speed() {
    logger.debug(TAG, "aaaaaaaaRCTAudioPlayer1TurboModule play");
  }
  /**
   * (iOS 14+ Only)
   * Returns whether the clipboard has a WebURL(UIPasteboardDetectionPatternProbableWebURL) content. Can check
   * if there is a WebURL content in clipboard without triggering PasteBoard notification for iOS 14+
   * This method returns a `Promise`, so you can use following code to check for WebURL content in clipboard.
   * ```javascript
   * async _hasWebURL() {
   *   var hasWebURL = await Clipboard.hasWebURL();
   * }
   * ```
   */
  duration() {}

  state() {}
  canPlay() {}
  canStop() {}
  canPrepare() {}
  isPlaying() {}
  isStopped() {}
  isPaused() {}
  setListener() {}
  removeListener() {}
  addListener(eventName: string): void {};
  removeListeners(count): void {};

  requestPermission(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      abilityAccessCtrl.createAtManager()
        .requestPermissionsFromUser(this.ctx.uiAbilityContext, PERMISSIONS).then(result => {
        if (result.authResults[0] == 0) {
          resolve(true);
        } else {
          logger.debug(TAG, `getString,text out:用户拒绝授权`);
          resolve(false);
        }
      }).catch(() => {
        logger.debug(TAG, `getString,text out:用户拒绝授权`);
        resolve(false);
      })
    });
  }
}