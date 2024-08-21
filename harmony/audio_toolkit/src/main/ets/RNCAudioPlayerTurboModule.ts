import { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { BusinessError } from '@ohos.base';
import media from '@ohos.multimedia.media';
import fs from '@ohos.file.fs';
import logger from './Logger';

interface PlayConfig {
  volume?: number,
  pan?: number,
  wakeLock?: boolean,
  duration?: number,
  looping?: boolean,
  speed?: number,
  autoDestroy?: boolean,
  continueToPlayInBackground?: boolean
}

interface PlayInfo {
  duration: number,
  position: number
}

interface Error {
  err: string,
  message?: string
}

enum ConfigKey {
  LOOPING = 'looping',
  SPEED = 'speed',
  VOLUME = 'volume',
  INITIALIZED = 'initialized'
}

enum StateChange {
  IDLE = 'idle',
  INITIALIZED = 'initialized',
  PREPARED = 'prepared',
  PLAYING = 'playing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
  RELEASED = 'released',
}

export class RCTAudioPlayerTurboModule extends TurboModule {
  private readonly SANDBOX_START = '/data/storage';
  private readonly FILE_MANAGER_START = 'file://docs';
  private readonly FD_PATH = 'fd://';
  private playerMap: Map<number, media.AVPlayer> = new Map()
  private playConfigMap: Map<number, PlayConfig> = new Map()
  private playInfoMap: Map<number, PlayInfo> = new Map()
  private playSeekCallbacks: Map<number, (err: string | Error, result?: PlayInfo) => void> = new Map()

  constructor(protected ctx: TurboModuleContext) {
    super(ctx);
    this.ctx = ctx
    this.onBackground()
  }

  setPlayer(playerId: number, player: media.AVPlayer) {
    this.playerMap.set(playerId, player)
  }

  getPlayer(playerId: number): media.AVPlayer {
    const player = this.playerMap.get(playerId)
    return player
  }

  applyConfig(playerId: number) {
    const player = this.playerMap.get(playerId)
    const config = this.playConfigMap.get(playerId)
    if (!config || !player) {
      return
    }
    if (player.state === ConfigKey.INITIALIZED) {
      return
    }
    Object.keys(config).forEach(key => {
      if (key === ConfigKey.LOOPING) {
        player.loop = config[ConfigKey.LOOPING]
      } else if (key === ConfigKey.SPEED) {
        player.setSpeed(config[ConfigKey.SPEED])
      } else if (key === ConfigKey.VOLUME) {
        player.setVolume(config[ConfigKey.VOLUME])
      }
    })
  }

  setConfig(playerId: number, config: PlayConfig) {
    const oldConfig = this.playConfigMap.get(playerId) || {}
    Object.keys(config).forEach(key => {
      oldConfig[key] = config[key]
    })
    this.playConfigMap.set(playerId, oldConfig)
  }

  set(playerId: number, config: PlayConfig, next: (err: string, result: object) => void) {
    const player = this.playerMap.get(playerId)
    if (!player) {
      next('not found player', {})
      return
    }
    this.setConfig(playerId, config)
    logger.debug(`set config:${JSON.stringify(config)}`)
    this.applyConfig(playerId)
    next('', {})
  }

  onBackground() {
    this.ctx.rnInstance.subscribeToLifecycleEvents('BACKGROUND', () => {
      logger.debug(`app state is BACKGROUND`)
      this.pauseOnBackground()
    })
  }

  pauseOnBackground() {
    this.playConfigMap.forEach((config, playerId) => {
      if (!config.continueToPlayInBackground) {
        const player = this.playerMap.get(playerId)
        if (player) {
          player.pause()
        }
      }
    })
  }

  emit(name: string, data: object) {
    this.ctx.rnInstance.emitDeviceEvent(name, data)
  }

  toEmit(playerId: number, name: string, data: object) {
    this.emit(`RCTAudioPlayerEvent:${playerId}`, {
      event: name,
      data
    })
  }

  setAVPlayerCallback(avPlayer: media.AVPlayer, playerId: number) {
    // seek操作结果回调函数
    avPlayer.on('seekDone', (seekDoneTime: number) => {
      logger.debug(`AVPlayer seek succeeded, seek time is ${seekDoneTime}`);
    })
    // error回调监听函数,当avPlayer在操作过程中出现错误时调用 reset接口触发重置流程
    avPlayer.on('error', (err: BusinessError) => {
      logger.debug(`Invoke avPlayer failed, code is ${err.code}, message is ${err.message}`);
      this.toEmit(playerId, 'error', {
        err: err.message,
        message: 'Harmony AVPlayer error'
      })
      avPlayer.reset(); // 调用reset重置资源，触发idle状态
    })
    // 状态机变化回调函数
    avPlayer.on('stateChange', async (state: string, reason: media.StateChangeReason) => {
      logger.debug(`stateChange:${state}`)
      switch (state) {
        case StateChange.IDLE: // 成功调用reset接口后触发该状态机上报
          avPlayer.release(); // 调用release接口销毁实例对象
          break;
        case StateChange.INITIALIZED: // avplayer 设置播放源后触发该状态上报
          avPlayer.prepare();
          break;
        case StateChange.PREPARED: // prepare调用成功后上报该状态机
          logger.debug(`prepared called.to and apply config and play`)
          this.applyConfig(playerId)
          break;
        case StateChange.PLAYING: // play成功调用后触发该状态机上报
          break;
        case StateChange.PAUSED: // pause成功调用后触发该状态机上报
          logger.debug('paused called.');
          break;
        case StateChange.COMPLETED: // 播放结束后触发该状态机上报
          logger.debug('completed called.');
          avPlayer.seek(0)
          this.toEmit(playerId, 'ended', {
            message: 'play completed'
          })
          const config = this.playConfigMap.get(playerId)
          if (config?.autoDestroy) {
            this.destroy(playerId)
          }
          break;
        case StateChange.STOPPED: // stop接口成功调用后触发该状态机上报
          logger.debug('Player state stopped called.');
          avPlayer.reset(); // 调用reset接口初始化avplayer状态
          break;
        case StateChange.RELEASED:
          break;
        default:
          break;
      }
    })
    avPlayer.on('seekDone', () => {
      const call = this.playSeekCallbacks.get(playerId)
      if (call) {
        call(``, this.getInfo(playerId))
        this.playSeekCallbacks.delete(playerId)
      }
      this.toEmit(playerId, 'seeked', {
        message: 'seek completed'
      })
    })

    const initInfo: PlayInfo = {
      duration: 0,
      position: 0
    }
    this.playInfoMap.set(playerId, initInfo)
    avPlayer.on('durationUpdate', (duration) => {
      logger.debug(`durationUpdate:${duration}`)
      const info = this.playInfoMap.get(playerId)
      if (info) {
        info.duration = duration
      }
    })

    avPlayer.on('timeUpdate', (time) => {
      const info = this.playInfoMap.get(playerId)
      if (info) {
        info.position = time
      }
    })
    avPlayer.on('audioInterrupt', (reason) => {
      logger.debug(`audioInterrupt start:${JSON.stringify(reason)}`)
      this.toEmit(playerId, 'forcePause', {
        message: 'lost audio focus, playback paused'
      })
    })

    avPlayer.on('endOfStream', () => {
      const config = this.playConfigMap.get(playerId)
      if (config?.looping) {
        this.toEmit(playerId, 'looped', {
          message: 'media playback looped'
        })
      }
    })
  }

  async createPlayer(pathStr: string, playerId: number) {
    logger.debug(`createPlayer path:${pathStr}`)
    try {
      const avPlayer: media.AVPlayer = await media.createAVPlayer()
      this.setAVPlayerCallback(avPlayer, playerId)
      if (pathStr.startsWith('http')) {
        avPlayer.url = pathStr
      } else {
        let fdPath = this.FD_PATH
        const context = this.ctx.uiAbilityContext
        let path = context.filesDir + '/' + pathStr
        if (pathStr.startsWith(this.SANDBOX_START) || pathStr.startsWith(this.FILE_MANAGER_START)) {
          path = pathStr
        }
        logger.debug(`file path:${path}`)
        const file = await fs.open(path)
        fdPath = fdPath + file.fd
        logger.debug(`fdPath:${fdPath}`)
        avPlayer.url = fdPath
      }
      this.setPlayer(playerId, avPlayer)
    } catch (e) {
      logger.warn(`createPlayer err:${JSON.stringify(e)}`)
    }
  }

  getInfo(playerId: number) {
    const info = this.playInfoMap.get(playerId)
    return info
  }

  getCurrentTime(playerId: number, callback: (err: string, result?: PlayInfo) => void) {
    const info = this.playInfoMap.get(playerId)
    if (info) {
      callback('', info)
    } else {
      callback('not found player')
    }
  }

  prepare(playerId: number, path: string, option: PlayConfig, next: () => void) {
    logger.debug(`prepare start`)
    this.setConfig(playerId, option)
    this.createPlayer(path, playerId).then(() => {
      next()
    })
  }

  checkPlayer(playerId: number, next: (err?: string) => void) {
    const hasPlayer = this.playerMap.has(playerId)
    if (hasPlayer) {
      return true
    } else {
      next?.('not found player')
      return false
    }
  }

  async play(playerId: number, callback: (err: string, result?: PlayInfo) => void) {
    try {
      logger.debug(`play start`)
      if (!this.checkPlayer(playerId, callback)) {
        return
      }
      const player = this.getPlayer(playerId)
      await player.play()
      callback('', this.getInfo(playerId))
    } catch (e) {
      callback?.(`player call play function err:${JSON.stringify(e)}`)
    }
  }

  async pause(playerId: number, callback: (err: string, result?: PlayInfo) => void) {
    logger.debug(`pause start`)
    if (!this.checkPlayer(playerId, callback)) {
      return
    }
    const player = this.getPlayer(playerId)
    await player.pause()
    this.toEmit(playerId, 'pause', {
      message: 'player paused'
    })
    callback('', this.getInfo(playerId))
  }

  async stop(playerId: number, callback: () => void) {
    logger.debug(`stop start`)
    if (!this.checkPlayer(playerId, callback)) {
      return
    }
    const config = this.playConfigMap.get(playerId)
    const player = this.getPlayer(playerId)
    if (config?.autoDestroy) {
      await player.pause()
      this.destroy(playerId)
      callback()
    } else {
      const oldCall = this.playSeekCallbacks.get(playerId)
      if (oldCall) {
        let err: Error = {
          err: 'seekfail',
          message: 'stopped before seek operation counld finish'
        }
        oldCall(err)
        this.playSeekCallbacks.delete(playerId)
      }
      this.playSeekCallbacks.set(playerId, callback)
      player.seek(0)
      await player.pause()
    }
  }

  destroy(playerId: number, callback?: () => void) {
    logger.debug(`destroy start`)
    const player = this.getPlayer(playerId)
    player?.release()
    this.playerMap.delete(playerId)
    this.playConfigMap.delete(playerId)
    this.playInfoMap.delete(playerId)
    this.playSeekCallbacks.delete(playerId)
    if (callback) {
      callback()
    }
  }

  resume(playerId: number, callback: () => void) {
    this.play(playerId, callback)
  }

  async seek(playerId: number, position: number, callback: () => void) {
    logger.info(`seekbar:${position}`)
    if (!this.checkPlayer(playerId, callback)) {
      return
    }
    const player = this.getPlayer(playerId)
    const oldCall = this.playSeekCallbacks.get(playerId)
    if (oldCall) {
      let err: Error = {
        err: 'seekfail'
      }
      oldCall(err)
      this.playSeekCallbacks.delete(playerId)
    }
    this.playSeekCallbacks.set(playerId, callback)
    player.seek(position)
  }
}