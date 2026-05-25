const audioToggleBtn = document.getElementById('audio-toggle-btn');

let isPlaying = false;
let audioContext = null;
let windSource = null;
let windGain = null;
let trainTimeout = null;

/**
 * AudioContextと音源を初期化する
 */
function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // マスターゲインノード
  windGain = audioContext.createGain();
  windGain.gain.setValueAtTime(0, audioContext.currentTime);
  windGain.connect(audioContext.destination);
}

/**
 * 風音をループ再生する
 */
async function startWind() {
  const response = await fetch('/audio/wind02.mp3');
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  windSource = audioContext.createBufferSource();
  windSource.buffer = audioBuffer;
  windSource.loop = true;
  windSource.connect(windGain);
  windSource.start();

  // フェードイン（2秒）
  windGain.gain.linearRampToValueAtTime(2.8, audioContext.currentTime + 2);
}

/**
 * 電車音をランダムなタイミングで再生する
 */
async function scheduleNextTrain(isFirst = false) {
  const delay = isFirst
    ? (Math.random() * 10 + 10) * 1000   // 初回: 10〜20秒
    : (Math.random() * 120 + 60) * 1000;  // 以降: 80〜180秒

  trainTimeout = setTimeout(async () => {
    if (!isPlaying) return;

    const response = await fetch('/audio/train.mp3');
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const trainGain = audioContext.createGain();
    trainGain.gain.setValueAtTime(0.5, audioContext.currentTime);
    trainGain.connect(audioContext.destination);

    const trainSource = audioContext.createBufferSource();
    trainSource.buffer = audioBuffer;
    trainSource.connect(trainGain);
    trainSource.start();

    // 次の電車をスケジュール
    scheduleNextTrain();
  }, delay);
}

/**
 * 全音声をフェードアウトして停止する
 */
function stopAudio() {
  if (!audioContext) return;

  // フェードアウト（2秒）してから停止
  windGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2);

  setTimeout(() => {
    if (windSource) {
      windSource.stop();
      windSource = null;
    }
    audioContext.close();
    audioContext = null;
  }, 2000);

  clearTimeout(trainTimeout);
}

/**
 * ボタンのクリック処理
 */
audioToggleBtn.addEventListener('click', async () => {
  if (!isPlaying) {
    isPlaying = true;
    audioToggleBtn.classList.add('is-playing');
    initAudio();
    await startWind();
    scheduleNextTrain(true);
  } else {
    isPlaying = false;
    audioToggleBtn.classList.remove('is-playing');
    stopAudio();
  }
});