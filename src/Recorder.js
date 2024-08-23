'use strict';
import {
  NativeAppEventEmitter,
  DeviceEventEmitter
} from 'react-native'
import RCTAudioRecorder from './RecorderModule'
import async from 'async';
import EventEmitter from 'eventemitter3';
import MediaStates from '@react-native-community/audio-toolkit/src/MediaStates';

// Only import specific items from lodash to keep build size down
import noop from 'lodash/noop';

var recorderId = 0;

var defaultRecorderOptions = {
  autoDestroy: true
};

/**
 * Represents a media recorder
 * @constructor
 */
class Recorder extends EventEmitter {
  constructor(path, options = defaultRecorderOptions) {
    super();

    this._path = path;
    this._options = options;

    this._recorderId = recorderId++;
    this._reset();

    let appEventEmitter = Platform.OS === 'ios' ? NativeAppEventEmitter : DeviceEventEmitter;

    appEventEmitter.addListener('RCTAudioRecorderEvent:' + this._recorderId, (payload: Event) => {
      this._handleEvent(payload.event, payload.data);
    });
  }

  _reset() {
    this._state = MediaStates.IDLE;
    this._duration = -1;
    this._position = -1;
    this._lastSync = -1;
  }

  _updateState(err, state) {
    this._state = err ? MediaStates.ERROR : state;
  }

  _handleEvent(event, data) {
    //console.log('event: ' + event + ', data: ' + JSON.stringify(data));
    switch (event) {
      case 'ended':
        this._state = Math.min(this._state, MediaStates.PREPARED);
        break;
      case 'info':
        // TODO
        break;
      case 'error':
        this._reset();
        //this.emit('error', data);
        break;
    }

    this.emit(event, data);
  }

  prepare(callback = noop) {
    if (Platform.OS !== 'harmony') {
      this._updateState(null, MediaStates.PREPARING);
      // Prepare recorder
      RCTAudioRecorder.prepare(this._recorderId, this._path, this._options, (err, fsPath) => {
        this._fsPath = fsPath;
        this._updateState(err, MediaStates.PREPARED);
        callback(err, fsPath);
      });
    } else {
      RCTAudioRecorder.prepare(this._recorderId, this._path, this._options, (err, fsPath) => {
        this._fsPath = fsPath;
        this._updateState(err, MediaStates.PREPARED);
        callback(err, fsPath);
      }, (err) => {
        this._updateState(err, MediaStates.PREPARING);
      });
    }
    return this;
  }

  record(callback = noop) {
    let tasks = [];
    // Make sure recorder is prepared
    if (this._state === MediaStates.IDLE) {
      tasks.push((next) => {
        this.prepare((err, fsPath) => {
          if (Platform.OS === 'harmony') {
            if (fsPath) {
              this._updateState(err, MediaStates.RECORDING);
              callback(err, fsPath);
            } else {
              this._updateState(err, MediaStates.IDLE);
              callback(err, null);
            }
          }
        });
      });
    }
    // Start recording
    tasks.push((next) => {
      RCTAudioRecorder.record(this._recorderId, next);
    });
    async.series(tasks, (err) => {
      if (Platform.OS !== 'harmony') {
        this._updateState(err, MediaStates.RECORDING);
        callback(err);
        return;
      }
      if (this._state === MediaStates.PAUSED) {
        this._updateState(err, MediaStates.RECORDING);
        callback(err);
      }
    });
    return this;
  }

  stop(callback = noop) {
    if (this._state >= MediaStates.RECORDING) {
      RCTAudioRecorder.stop(this._recorderId, (err) => {
        this._updateState(err, MediaStates.DESTROYED);
        callback(err);
      });
    } else {
      setTimeout(callback, 0);
    }

    return this;
  }

  pause(callback = noop) {
    if (this._state >= MediaStates.RECORDING) {
      RCTAudioRecorder.pause(this._recorderId, (err) => {
        this._updateState(err, MediaStates.PAUSED);
        callback(err);
      });
    } else {
      setTimeout(callback, 0);
    }

    return this;
  }

  toggleRecord(callback = noop) {
    if (this._state === MediaStates.RECORDING) {
      this.stop((err) => {
        callback(err, true);
      });
    } else {
      this.record((err) => {
        callback(err,false);
      });
    }

    return this;
  }

  destroy(callback = noop) {
    this._reset();
    RCTAudioRecorder.destroy(this._recorderId, callback);
  }

  get state()       { return this._state;                          }
  get canRecord()   { return this._state >= MediaStates.PREPARED;  }
  get canPrepare()  { return this._state == MediaStates.IDLE;      }
  get isRecording() { return this._state == MediaStates.RECORDING; }
  get isPrepared()  { return this._state == MediaStates.PREPARED;  }
  get fsPath()      { return this._fsPath; }
}

export default Recorder;
