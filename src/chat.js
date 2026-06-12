// HTMLから操作したい要素を取得する
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatPanel = document.getElementById("chat-panel");
const chatTimeline = document.getElementById("chat-timeline");
const chatNameInput = document.getElementById("chat-name");
const chatMessageInput = document.getElementById("chat-message");
const chatSendBtn = document.getElementById("chat-send-btn");
const fetchWhispersBtn = document.getElementById("fetch-whispers-btn");
const whispersContainer = document.getElementById("whispers-container");
const credit = document.getElementById("credit-area");
const charCount = document.getElementById("char-count");
import { supabase } from "./supabase.js";

// 独り言の表示状態とタイマーを管理する変数
let isWhispersActive = false;
let whispersTimeout;

/**
 * チャットパネルの開閉（トグル）処理
 * 右下のボタンを押したときに実行される
 */
chatToggleBtn.addEventListener("click", () => {
  // classList.toggle で 'hidden' クラスを付け外しする
  // これにより、CSSのtransitionが反応して「ぼわっと」アニメーションする
  chatPanel.classList.toggle("hidden");

  function measureButtonWidth(btn, text) {
    const clone = btn.cloneNode(true);
    clone.style.width = "auto";
    clone.style.visibility = "hidden";
    clone.style.position = "fixed";
    clone.textContent = text;
    document.body.appendChild(clone);
    const width = clone.offsetWidth;
    document.body.removeChild(clone);
    return width;
  }

  // パネルの状態に合わせてボタンのテキストを変更する
  if (chatPanel.classList.contains("hidden")) {
    const targetWidth = measureButtonWidth(chatToggleBtn, "言葉を残す");
    chatToggleBtn.style.width = chatToggleBtn.offsetWidth + "px";
    chatToggleBtn.innerHTML = `<span class="btn-ja">言葉を残す</span><span class="btn-en">Write</span>`;

    requestAnimationFrame(() => {
      chatToggleBtn.style.width = targetWidth + "px";
    });
    credit.classList.add("hidden");
  } else {
    const targetWidth = measureButtonWidth(chatToggleBtn, "閉じる");

    chatToggleBtn.style.width = chatToggleBtn.offsetWidth + "px";
    chatToggleBtn.innerHTML = `<span class="btn-ja">閉じる</span><span class="btn-en">Close</span>`;

    requestAnimationFrame(() => {
      chatToggleBtn.style.width = targetWidth + "px";
    });
    credit.classList.remove("hidden");
    // パネルを開いた（戻した）ときに、独り言が漂っていれば同期して消去する
    if (isWhispersActive) {
      clearWhispers();
    }
  }
});

let scrollTimeout;

chatTimeline.addEventListener("scroll", () => {
  chatTimeline.classList.add("is-scrolling");

  clearTimeout(scrollTimeout);

  scrollTimeout = setTimeout(() => {
    chatTimeline.classList.remove("is-scrolling");
  }, 1000);
});

// --- ステップ3 - ローカルタイムラインと入力制限

/**
 * 送信ボタンのクリック処理
 */
chatSendBtn.addEventListener("click", async () => {
  // .trim() で前後の無駄な空白（スペースや改行）を削除
  const rawMessage = chatMessageInput.value.trim();
  const rawName = chatNameInput.value.trim();

  // メッセージが空の場合は処理を中断（何もせず終了）
  if (!rawMessage) return;
  const isTooShort = [...rawMessage].length < 3;
  const isSpam = /(.)\1{4,}/.test(rawMessage);
  const isWordSpam = /(.{2,})\1{3,}/.test(rawMessage);

  // 1. 名前未入力時は「誰かさん」にする
  const finalName = rawName !== "" ? rawName : "誰かさん";

  // 2. 文字数制限の念押し (HTMLのmaxlengthでも防いでいるがJSでも念のためカット)
  const finalMessage = rawMessage.substring(0, 50);

  // タイムラインにメッセージを追加する関数を実行
  addMessageToTimeline(finalName, finalMessage);

  // 3. 送信後3秒間、入力をロックする関数を実行.
  disableInputsForSeconds(3);

  // 送信後、メッセージ入力欄だけを空にする（名前はセッション固定の要件に向け残す）
  chatMessageInput.value = "";

  charCount.textContent = 0;

  // SupabaseのRPC（データベース関数）を呼び出して保存する
  try {
    // 画面への表示（addMessageToTimeline）を先に済ませてから裏で保存通信を行っています。
    // これを「楽観的UI（Optimistic UI）」と呼び、ユーザーに待ち時間を感じさせないプロのテクニックです。
    if (!isTooShort && !isSpam && !isWordSpam) {
      const { error } = await supabase.rpc("send_lonely_message", {
        p_message: finalMessage, // SQLで定義した引数名(p_message)に合わせる
      });
    }

    if (error) {
      // サーバー側でエラー（URL入りや3秒以内の連投など）弾かれた場合の処理
      console.error("保存エラー:", error.message);
      // ※自分の画面には表示されてしまいますが、「独り言」のコンセプト上、
      // ユーザー体験を優先し、わざわざエラーアラートを出して画面から消すような野暮なことはしません。
    } else {
      console.log("Supabaseへの保存に成功しました！");
    }
  } catch (err) {
    console.error("通信エラー:", err);
  }
});

/**
 * タイムラインにメッセージ要素を生成して追加する関数
 */
function addMessageToTimeline(name, text) {
  // メッセージ全体の枠となるdivを作成
  const messageEl = document.createElement("div");
  messageEl.classList.add("chat-message-item");

  // 名前のdivを作成
  const nameEl = document.createElement("div");
  nameEl.classList.add("chat-message-name");
  // 💡シニアエンジニアのポイント:
  // innerHTMLではなくtextContentを使うことで、ユーザーが悪意のあるタグを入力しても
  // ただの文字列として処理されます（XSS攻撃の防止）。
  nameEl.textContent = name;

  // テキストのdivを作成
  const textEl = document.createElement("div");
  textEl.classList.add("chat-message-text");
  textEl.textContent = text;

  // 枠の中に名前とテキストを入れる
  messageEl.appendChild(nameEl);
  messageEl.appendChild(textEl);

  // 💡シニアエンジニアのポイント: ランダムなふよふよアニメーションの生成
  // ここで数値を調整: 周期(duration)は4秒〜7秒の間、遅延(delay)は0秒〜2秒の間でランダムに決定
  const duration = (Math.random() * 3 + 4).toFixed(2);
  const delay = (Math.random() * 2).toFixed(2);

  // CSSで定義した fadeInOpacity(出現) と floatMedium(ふよふよ) を同時に適用
  messageEl.style.animation = `fadeInOpacity 2.0s ease forwards, floatMedium ${duration}s ease-in-out infinite ${delay}s`;

  // タイムラインの一番下に追加
  chatTimeline.appendChild(messageEl);

  // 追加後、タイムラインを一番下まで強制スクロールして最新メッセージを見せる
  chatTimeline.scrollTop = chatTimeline.scrollHeight;

  // 4. 画面上の表示メッセージが50件を超えたら、一番古いもの（先頭）を削除
  while (chatTimeline.children.length > 50) {
    chatTimeline.removeChild(chatTimeline.firstChild);
  }
}

/**
 * 指定した秒数だけ入力欄とボタンを無効化（disabled）にする関数
 */
function disableInputsForSeconds(seconds) {
  // 物理的に操作不可にする
  chatNameInput.disabled = true;
  chatMessageInput.disabled = true;
  chatSendBtn.disabled = true;

  // 指定秒数(ミリ秒)後に元に戻す
  setTimeout(() => {
    chatNameInput.disabled = false;
    chatMessageInput.disabled = false;
    chatSendBtn.disabled = false;
    chatSendBtn.textContent = originalText;

    // ロック解除後、すぐに次の入力ができるようにメッセージ欄にフォーカスを当てる
    chatMessageInput.focus();
  }, seconds * 1000);
}

// chat.js などに入力欄のイベントとして追加するイメージ

chatMessageInput.addEventListener("keydown", (e) => {
  // 💡日本語入力の「変換確定のEnter」のときは、送信処理をスキップする（誤爆防止）
  if (e.isComposing || e.keyCode === 229) {
    return;
  }

  // Enterキーが押され、かつShiftキーが同時に押されていない場合
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // 本来の改行処理（textareaのデフォルト挙動）を止める

    // 送信ボタンが活性化（disabledではない）している場合のみ送信を実行
    const sendButton = document.getElementById("chat-send-btn"); // 送信ボタンのID
    if (!sendButton.disabled) {
      sendButton.click(); // 送信ボタンのクリックイベントをプログラムから強制発火
    }
  }
});

// 追加: --- ステップ5 - 「誰かの独り言を見る」機能 ---

/**
 * 「誰かの独り言を見る」ボタンのクリック処理
 */
fetchWhispersBtn.addEventListener("click", async () => {
  // 1. セッション中1回限りにするため、即座にボタンを無効化
  fetchWhispersBtn.disabled = true;

  // 2. スマホ(画面幅768px未満)かどうかの判定と、取得件数の決定
  const isMobile = window.innerWidth < 768;
  // ここで数値を調整: スマホは3〜5件、PCは5〜10件
  const limit = isMobile
    ? Math.floor(Math.random() * 3) + 3
    : Math.floor(Math.random() * 6) + 5;

  // 3. スマホの場合は、空間を広く見せるためにチャットパネルをフェードアウト
  if (isMobile) {
    chatPanel.classList.add("hidden");
    chatToggleBtn.textContent = "言葉を残す";
  }

  try {
    // 4. SupabaseのRPCを呼び出し、ランダム取得＆即時削除を実行
    const { data, error } = await supabase.rpc("fetch_and_delete_whispers", {
      p_limit: limit,
    });

    if (error) throw error;

    isWhispersActive = true;

    // 5. 取得したデータを画面に配置する関数を実行
    displayWhispers(data, isMobile);

    // 6. 3分(180,000ミリ秒)後に自動で消え去るタイマーをセット
    whispersTimeout = setTimeout(() => {
      if (isWhispersActive) {
        clearWhispers();
        // スマホでパネルが消えたままなら、自動でフェードインして戻す
        if (isMobile && chatPanel.classList.contains("hidden")) {
          chatPanel.classList.remove("hidden");
          chatToggleBtn.innerHTML = `<span class="btn-ja">閉じる</span><span class="btn-en">Close</span>`;
        }
      }
    }, 180000);
  } catch (err) {
    console.error("独り言の取得に失敗しました:", err);
    fetchWhispersBtn.textContent = "取得失敗";
  }
});

/**
 * 取得した独り言をグリッドにランダム配置する関数（PC・スマホ最適化＋星空演出版）
 */
function displayWhispers(messages, isMobile) {
  whispersContainer.innerHTML = ""; // 念のためコンテナを空にする

  // データが0件だった場合のフォールバック処理
  if (!messages || messages.length === 0) {
    messages = [
      {
        message:
          "今は独り言はありません。気軽にメッセージを残していってください",
      },
    ];
  }

  // 1. 画面サイズに合わせてマスの「列数」と「1マスの幅」を計算
  const colsCount = isMobile ? 2 : 4; // スマホは横2マス、PCは横4マス
  const cellW = window.innerWidth / colsCount;
  const cellH = window.innerHeight / 4; // 縦は共通で4分割

  // 2. 有効なマスのリストを作成（除外ゾーンの計算）
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < colsCount; col++) {
      // 💡対策: 長い文章が下に突き抜けるのを防ぐため、最下段（行3）は一律で除外
      if (row === 3) continue;

      // 💡PCの場合のみ、右下エリア（行2、列2~3）はチャットUIと被るので除外
      if (!isMobile && row === 2 && col >= 2) continue;

      cells.push({ row, col });
    }
  }

  // 3. マス目の配列をランダムにシャッフル（Fisher-Yatesアルゴリズム）
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  // 4. メッセージを1つずつ配置
  messages.forEach((msg, index) => {
    if (index >= cells.length) return; // マス目よりメッセージが多い場合の安全対策

    const cell = cells[index];
    const el = document.createElement("div");
    el.classList.add("whisper-item");

    // --- ✨言葉を星に還すフィルター（アート形NGワード対策） ---
    let safeMessage = msg.message;

    const holyWordsJa = [
      "死",
      "殺",
      "淫",
      "糞",
      "キチガイ",
      "首吊り",
      "くたばれ",
      "セックス",
      "ちんこ",
      "まんこ",
      "チンコ",
      "マンコ",
      "レイプ",
      "イラマチオ",
      "フェラ",
      "ヤる",
      "ヤりたい",
      "ちんぽ",
      "チンポ",
      "ペニス",
      "クリトリス",
      "ヴァギナ",
      "アナル",
      "射精",
      "ザーメン",
      "オナニー",
      "オナる",
      "池沼",
    ];

    const holyWordsEn = [
      "die",
      "kill",
      "murder",
      "hang yourself",
      "kys",
      "fuck",
      "pussy",
      "cock",
      "dick",
      "ass",
      "cum",
      "rape",
      "blowjob",
      "porn",
      "nigger",
      "faggot",
      "retard",
      "chink",
      "spic",
      "bastard",
      "motherfucker",
    ];

    holyWordsJa.forEach((word) => {
      safeMessage = safeMessage.replace(new RegExp(word, "g"), "☆");
    });

    holyWordsEn.forEach((word) => {
      safeMessage = safeMessage.replace(new RegExp(`\\b${word}\\b`, "gi"), "☆");
    });

    el.textContent = safeMessage;

    // --- はみ出し・折り返し対策 ---
    el.style.whiteSpace = "pre-wrap";
    el.style.wordBreak = "break-all";
    el.style.maxWidth = isMobile ? "40vw" : "17vw";

    // --- フォントサイズのスマホ最適化 ---
    const fontSize = isMobile
      ? Math.floor(Math.random() * 5) + 12 // 12px 〜 16px
      : Math.floor(Math.random() * 9) + 14; // 14px 〜 22px
    el.style.fontSize = `${fontSize}px`;

    //  0.5 〜 1.0 の間でランダムな数値を計算し、要素に直接付与します。
    const randomOpacity = (Math.random() * 0.7 + 0.3).toFixed(2);
    // 直値ではなく「--op」という名前の変数としてCSSに数値を送り込みます
    el.style.setProperty("--op", randomOpacity);
    // -----------------------------------------------------

    // マス目の中心付近で、さらに少しだけランダムに位置をずらす（自然な散らばり）
    const isLastCol = cell.col === colsCount - 1;
    const offsetX = isLastCol
      ? cellW * (0.15 + Math.random() * 0.3) // 右端は左寄りに制限
      : cellW * (0.15 + Math.random() * 0.7);
    const offsetY = cellH * (0.15 + Math.random() * 0.7);
    el.style.left = `${((cell.col * cellW + offsetX) / window.innerWidth) * 100}%`;
    el.style.top = `${((cell.row * cellH + offsetY) / window.innerHeight) * 100}%`;

    // アニメーションのランダム化（周期4〜8秒、遅延0〜2秒）
    const floatDuration = (Math.random() * 4 + 4).toFixed(2);
    const floatDelay = (Math.random() * 2).toFixed(2);

    // CSSで定義した vanishSmoke(180秒で消滅) と floatSmall(ふよふよ) を同時適用
    el.style.animation = `vanishSmoke 180s forwards, floatSmall ${floatDuration}s ease-in-out infinite ${floatDelay}s`;

    whispersContainer.appendChild(el);
  });
}

/**
 * 漂っている独り言をフェードアウトしてDOMから削除する関数
 */
function clearWhispers() {
  isWhispersActive = false;
  clearTimeout(whispersTimeout);

  // パネルの出現(1s)と同期して、1秒かけてふわっと透明にする
  whispersContainer.style.transition = "opacity 1s ease";
  whispersContainer.style.opacity = "0";

  // 透明になった後、DOMから完全に削除して状態をリセット
  setTimeout(() => {
    whispersContainer.innerHTML = "";
    whispersContainer.style.opacity = "1";
    whispersContainer.style.transition = "";
  }, 1000);
}

/**
 * メッセージ入力欄の文字数をリアルタイムにカウントする処理
 */
chatMessageInput.addEventListener("input", () => {
  // 現在入力されている文字の長さを取得
  const currentLength = chatMessageInput.value.length;

  // HTMLの「0」の部分を、現在の文字数に書き換える
  charCount.textContent = currentLength;
});
