import gsap from "gsap";

export function createLoadingAnimation(world) {
  let isLoaded = false;
  let isMinDurationPassed = false;

  const displacementMap = document.querySelector("#water-wave feDisplacementMap");

  // 1. 最初の文字スライドイン演出（最低保証タイムライン）
  const tl = gsap.timeline({});

  // 日本語と英語を「同時」に時間差（stagger）で出現させる
  tl.to(".main-title span", {
    x: 0,
    opacity: 1,
    duration: 1,
    ease: "back.inOut(1.7)",
    stagger: 0.1
  }, 0);

  tl.to(".sub-title span", {
    x: 0,
    opacity: 0.7,
    duration: 1,
    ease: "back.inOut(1.7)",
    stagger: 0.05
  }, 0); // 0秒地点から同時スタート

  tl.call(() => {
    isMinDurationPassed = true;
    checkAndStartFadeOut();
  }, null, 2);

  // 2. LoadingManagerのロード完了イベントを監視
  world.loadingManager.onLoad = () => {
    // 3D側の初描画バグ（チラつき）を防ぐため、2フレーム待ってから完了とする
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isLoaded = true;
        checkAndStartFadeOut();
      });
    });
  };

  // 3. 条件が揃ったら煙のように消去する関数
  function checkAndStartFadeOut() {
    if (!isLoaded || !isMinDurationPassed) return;

    const fadeTl = gsap.timeline({
      onComplete: () => {
        // 完全に消えたらクリーンアップ
        document.querySelector("#loading-screen").remove();
        world.scene.remove(world.smokeMesh);
        world.smokeMaterial.dispose();
      }
    });

    // A. タイトルテキストをゆらめかせながら消す
    fadeTl.to(displacementMap, {
      attr: { scale: 520 }, // SVGのディスプレイスメントマップを歪ませる
      duration: 1.2,
      ease: "power3.in"
    }, -0.3);

    fadeTl.to(".loading-titles", {
      opacity: 0,
      blur: 8,
      duration: 1.5,
      ease: "power2.inOut"
    }, 0.3); // ゆらめき始めてからじわっと消す

    // B. 背景の「黒い幕」を煙のように霧散させる
    fadeTl.to(world.smokeMaterial.uniforms.uProgress, {
      value: 1.0,
      duration: 3, // 2.5秒かけてゆっくり煙が引いていく
      ease: "expoScale(0.5,7,none)",
    }, 0);

    fadeTl.to("#ui-container", {
      opacity: 1,
      visibility: "visible",
      duration: 1.2,
      ease: "power2.out"
    }, 1.3);

    fadeTl.to(".audio-toggle-btn", {
      opacity: 0.5,
      visibility: "visible",
      duration: 1.2,
      ease: "power2.out"
    }, 1.3);

    fadeTl.to("#canvas", {
      scale: 1.0,
      duration: 3,
      ease: "power3.Out"
    }, -0.2);
    
  }
}