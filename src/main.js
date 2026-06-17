import * as THREE from "three";
import gsap from "gsap";
import { World } from "./world.js";
import { createLoadingAnimation } from "./animation.js";

import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  DepthOfFieldEffect,
  NoiseEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BlendFunction,
} from "postprocessing";

class App {
  constructor() {
    this.canvas = document.querySelector("#canvas");

    // ここでWorldクラス(設計図)を組み立ててシーンを描画してる
    this.world = new World(this.canvas);

    // レンダー
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(this.world.sizes.width, this.world.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.toneMapping = THREE.NoToneMapping;

    // クロック
    this.clock = new THREE.Clock();

    this.initPostProcessing();

    this.adjustCamera(this.world.sizes.width, this.world.sizes.height);

    this.init();

    createLoadingAnimation(this.world);
  }

  //! ポストプロセス
  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);

    this.composer.addPass(new RenderPass(this.world.scene, this.world.camera));

    // 各エフェクトインスタンス化
    //* ブルーム
    this.bloomEffect = new BloomEffect({
      intensity: 1,
      luminanceThreshold: 0.15,
      luminanceSmoothing: 0.025,
      mipmapBlur: true,
    });

    //* ボケ
    this.dofEffect = new DepthOfFieldEffect(this.world.camera, {
      worldFocusDistance: 20.8, // カメラからの実際の距離（メートル）
      worldFocusRange: 18, // ピントが合う範囲
      bokehScale: 4.8,
      height: 480,
    });

    //* フィルムグレイン
    this.noiseEffect = new NoiseEffect({
      blendFunction: BlendFunction.OVERLAY,
      premultiply: false,
    });
    this.noiseEffect.blendMode.opacity.value = 0.3;

    /*
    NORMAL → 普通に重ねる
    COLOR_SCREEN → 明るくなる
    MULTIPLY → 暗くなる
    OVERLAY → コントラストが上がる
    COLOR_DODGE → 強く明るくなる
    SOFT_LIGHT → ソフトに明るくなる
    ADD → 加算、光の表現に
    */

    //* トーンマッピング
    this.toneMappingEffect = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
    });
    this.renderer.toneMappingExposure = 1.27;

    //* エフェクトを一つにまとめてコンポーザーに追加
    const effectPass = new EffectPass(
      this.world.camera,
      this.bloomEffect,
      this.dofEffect,
      this.noiseEffect,
      this.toneMappingEffect,
    );
    this.composer.addPass(effectPass);

    // ポストプロセスアニメーション
    const animateBloom = () => {
      gsap.to(this.bloomEffect, {
        intensity: Math.random() * 2 + 0.8, // 0.5〜2.5のランダム
        duration: Math.random() * 6 + 6, // 4〜10秒のランダム
        ease: "sine.inOut",
        delay: Math.random() * 3 + 3, // 1〜4秒のランダムな待機
        onComplete: animateBloom, // 完了したら再度ランダムで実行
      });
    };

    animateBloom();
  }

  init() {
    window.addEventListener("resize", () => this.onResize());
    this.tick();
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.world.resize(width, height);

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    if (this.composer) {
      this.composer.setSize(width, height);
    }

    this.adjustCamera(width, height);

    // ローディングアニメーションスマホ時対応
    if (this.world && this.world.smokeMaterial) {
      this.world.smokeMaterial.uniforms.uAspect.value =
        window.innerWidth / window.innerHeight;
    }
  }

  tick() {
    const delta = this.clock.getDelta();

    this.world.update(delta);

    if (this.composer) {
      this.composer.render(delta);
    }

    window.requestAnimationFrame(() => this.tick());
  }

  //! アスペクト比調整
  adjustCamera(width, height) {
    const aspect = width / height;
    this.world.camera.aspect = aspect;

    const config = {
      mobile: {
        fov: 45,
        x: 2,
        y: 1,
        z: 9,
      },
      desktop: {
        fov: 45,
        x: 0,
        y: 1.5,
        z: 8.8,
      },
      ultrawide: {
        fov: 40,
        x: 0,
        y: 1,
        z: 8,
      },
    };

    const minAspect = 1.77;
    const maxAspect = 2.5;
    let targetFov, targetX, targetY, targetZ;

    if (aspect < 1) {
      // 1. スマホ・縦長画面
      targetFov = config.mobile.fov;
      targetX = config.mobile.x;
      targetY = config.mobile.y;
      targetZ = config.mobile.z;
    } else if (aspect <= minAspect) {
      // 2. 標準的なPC画面（16:9以下）
      targetFov = config.desktop.fov;
      targetX = config.desktop.x;
      targetY = config.desktop.y;
      targetZ = config.desktop.z;
    } else if (aspect >= maxAspect) {
      // 3. ウルトラワイド（21:9以上）
      targetFov = config.ultrawide.fov;
      targetX = config.ultrawide.x;
      targetY = config.ultrawide.y;
      targetZ = config.ultrawide.z;
    } else {
      // 4. 標準〜ワイドの間（滑らかに補間）
      //* t = 0はデスクトップ、 t = 1はウルトラワイド、 t = 0.5はちょうど中間
      //* tとは標準とワイドの間のどのへんにいるかを報告する係（ 0〜1 ）。
      //* lerp関数：報告を受けて、その場所にぴったりの「中間の数字」を算出する計算機。
      const t = (aspect - minAspect) / (maxAspect - minAspect);
      // 線形補間の計算関数
      const lerp = (start, end, t) => start + (end - start) * t;
      targetFov = lerp(config.desktop.fov, config.ultrawide.fov, t);
      targetX = lerp(config.desktop.x, config.ultrawide.x, t);
      targetY = lerp(config.desktop.y, config.ultrawide.y, t);
      targetZ = lerp(config.desktop.z, config.ultrawide.z, t);
    }

    // もし、アスペクト比が 2.5 を超えたら...
    if (aspect > 2.5) {
      const vFovRad = (config.ultrawide.fov * Math.PI) / 180;
      const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * maxAspect);
      // 固定した横幅を維持するために、現在のアスペクト比に合わせて縦のFOVを逆算する
      targetFov =
        (2 * Math.atan(Math.tan(hFovRad / 2) / aspect) * 180) / Math.PI;
      // 位置はウルトラワイドの設定をそのまま使用
      targetX = config.ultrawide.x;
      targetY = config.ultrawide.y;
      targetZ = config.ultrawide.z;
    }

    // カメラに値を適用
    this.world.camera.fov = targetFov;
    if (this.world.cameraBasePosition) {
      this.world.cameraBasePosition.set(targetX, targetY, targetZ);
    } else {
      // 念のためのフォールバック
      this.world.camera.position.set(targetX, targetY, targetZ);
    }
    // ルックアット
    this.world.camera.lookAt(0, 3, 0);
    // 行列を更新（これを忘れると反映されない）
    this.world.camera.updateProjectionMatrix();
  }
}

new App();
