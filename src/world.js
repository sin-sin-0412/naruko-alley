import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.sizes = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#000000");
    this.loadingManager = new THREE.LoadingManager();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.sizes.width / this.sizes.height,
      0.1,
      1000,
    );
    this.camera.position.set(0, 1.5, 8.8);
    this.camera.lookAt(0, 3, 0);
    this.scene.add(this.camera);

    this.setupFog();
    this.setupLights();
    this.loadModel();
    this.setupSmokeCurtain();

    this.mixer = null;
    this.actions = {};

    // 顔テクスチャ
    this.faceMesh = null;
    this.regularTexture = null;
    this.closedEyesTexture = new THREE.TextureLoader().load(
      "/image/closed_eyes.png",
    );
    this.closedEyesTexture.flipY = false;
    this.closedEyesTexture.colorSpace = THREE.SRGBColorSpace;

    // 実写背景
    const bgTexture = new THREE.TextureLoader().load("/image/soto02.jpg");
    bgTexture.colorSpace = THREE.SRGBColorSpace;
    const bgGeometry = new THREE.PlaneGeometry(16, 9);
    const bgMaterial = new THREE.MeshBasicMaterial({ map: bgTexture });
    const bgPlane = new THREE.Mesh(bgGeometry, bgMaterial);
    bgPlane.position.set(1, 7.1, -13);
    bgPlane.scale.set(1, 1, 1);
    this.scene.add(bgPlane);

    // 修正: isRunning()の代わりにフラグで割り込み中かどうかを管理
    this.isInterrupting = false;
  }

  // 霧
  setupFog() {
    this.fogColor = "#2c393a";
    this.scene.fog = new THREE.Fog(this.fogColor, 2, 44.8);
    this.fogEnabled = { value: true };
  }

  setupLights() {
    // ヘミライト
    this.hemiLight = new THREE.HemisphereLight("#dafafb", "#83735d", 0.39);
    this.hemiLight.position.set(0, 0, 0);
    this.scene.add(this.hemiLight);

    // ダイレクショナル1
    this.dirLight1 = new THREE.DirectionalLight("#f1fbe0", 3.38);
    this.dirLight1.position.set(-7.3, 24.8, -36.5);
    this.dirLight1.castShadow = true;
    this.dirLight1.shadow.mapSize.width = 2048;
    this.dirLight1.shadow.mapSize.height = 2048;
    this.dirLight1.shadow.camera.near = 0.5;
    this.dirLight1.shadow.camera.far = 50;
    this.dirLight1.shadow.camera.left = -10;
    this.dirLight1.shadow.camera.right = 10;
    this.dirLight1.shadow.camera.top = 10;
    this.dirLight1.shadow.camera.bottom = -10;
    this.dirLight1.shadow.bias = 0;
    this.dirLight1.shadow.normalBias = 0.032;
    this.dirLight1.shadow.radius = 4;
    this.scene.add(this.dirLight1);

    // ダイレクショナル2
    this.dirLight2 = new THREE.DirectionalLight("#9cbed8", 0.5);
    this.dirLight2.position.set(-5, 5, -5);
    this.scene.add(this.dirLight2);

    // ポイントライト1
    this.pointLight1 = new THREE.PointLight("#d9cca8", 1.0, 20, 2.5);
    this.pointLight1.position.set(7.5, 8.9, 2);
    this.scene.add(this.pointLight1);

    // ポイントライト2
    this.pointLight2 = new THREE.PointLight("#ffebf3", 0.24, 4.6, 0.2);
    this.pointLight2.position.set(-4.6, 1.7, 0.5);
    this.scene.add(this.pointLight2);
  }

  // モデル読み込み
  loadModel() {
    const loader = new GLTFLoader(this.loadingManager);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
    );
    loader.setDRACOLoader(dracoLoader);

    loader.load("/model/arcade.glb", (gltf) => {
      this.model = gltf.scene;
      this.model.position.set(0, 0, 0);
      this.model.scale.set(0.5, 0.5, 0.5);
      this.model.rotation.y = -Math.PI;

      // アニメーション設定
      this.mixer = new THREE.AnimationMixer(this.model);
      gltf.animations.forEach((clip) => {
        const action = this.mixer.clipAction(clip);
        this.actions[clip.name] = action;

        if (clip.name !== "sit") {
          action.setLoop(THREE.LoopOnce);
          action.clampWhenFinished = true;
        }
      });

      this.actions["sit"].play();

      // サインポールガラスの黄ばみ
      this.poleGlassMaterial = new THREE.ShaderMaterial({
        transparent: true,
        vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
        fragmentShader: `
    varying vec2 vUv;
    void main() {
      float edge = pow(abs(vUv.y - 0.2) * 2.0, 2.2);
      vec3 yellow = vec3(1.0, 0.6, 0.0); // より濃いオレンジ寄りの黄色
      float alpha = mix(0.0, 0.3, edge); // 端の不透明度を上げる
      gl_FragColor = vec4(yellow, alpha);
     }
   `,
      });

      // サインポールの模様
      this.poleMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vPosition;
          void main() {
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          varying vec2 vUv;
          varying vec3 vPosition;
          void main() {
            float stripe = mod((vPosition.y + vPosition.x * 0.9) * 0.5 - time, 1.0);
            vec3 red = vec3(0.91, 0.26, 0.26);
            vec3 blue = vec3(0.24, 0.35, 0.50);
            vec3 white = vec3(1.0);
            vec3 color = stripe < 0.33 ? red : stripe < 0.66 ? white : blue;
            float flicker = 1.0;
            float noise = fract(sin(time * 100.0) * 43758.5453);
            if (noise > 0.99) { // 3%の確率で
              flicker = 0.8;    // 一瞬暗くなる
            }
            gl_FragColor = vec4(color * 0.45 * flicker, 1.0); // 0.6で暗さ調整
           }          
          `,
      });

      // メッシュ設定
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          //* サインポールガラス
          if (child.name === "pole_glass") {
            child.material = this.poleGlassMaterial;
          }

          //* サインポール
          if (child.name === "pole") {
            child.material = this.poleMaterial;
          }

          //* 顔テクスチャ
          if (child.name === "mesh_131") {
            this.faceMesh = child;
            this.regularTexture = child.material.map;
          }

          //* 窓ガラス
          if (child.isMesh) {
            if (child.name.includes("w_glass")) {
              child.material = child.material.clone();
              child.material.metalness = 0.8;
              child.material.roughness = 0.5;
              child.material.transparent = true;
              child.material.needsUpdate = true;
              child.material.opacity = 0.7;
            }
          }

          //* 看板文字
          if (child.isMesh) {
            if (child.name.includes("text")) {
              child.material = child.material.clone();
              child.material.metalness = 0.5;
              child.material.roughness = 0.3;
            }
          }

          //* 消火器
          if (child.isMesh) {
            if (child.name.includes("fire")) {
              child.material = child.material.clone();
              child.material.metalness = 0.6;
              child.material.roughness = 0.3;
            }
          }

          //* メーター
          if (child.isMesh) {
            if (child.name.includes("mater")) {
              child.material = child.material.clone();
              child.material.metalness = 0.3;
              child.material.roughness = 0.8;
            }
          }

          //* 金属配管
          if (child.isMesh) {
            if (child.name.includes("pipe")) {
              child.material = child.material.clone();
              child.material.metalness = 0.8;
              child.material.roughness = 0.4;
            }
          }

          //* 地面・左縦配管
          if (child.isMesh) {
            if (child.name.includes("haikan")) {
              child.material = child.material.clone();
              child.material.metalness = 0.3;
              child.material.roughness = 0.8;
            }
          }

          //* 間接照明
          if (child.isMesh) {
            if (child.name.includes("light")) {
              child.material = child.material.clone();
              child.material.metalness = 0.2;
              child.material.roughness = 0.5;
            }
          }

          //* 井戸
          if (child.isMesh) {
            if (child.name.includes("ido")) {
              child.material = child.material.clone();
              child.material.metalness = 0.5;
              child.material.roughness = 0.4;
            }
          }

          //* 隙間壁
          if (child.isMesh) {
            if (child.name.includes("s_wall")) {
              child.material = child.material.clone();
              child.material.metalness = 0.1;
              child.material.roughness = 0.8;
            }
          }

          //* 正面壁
          if (child.isMesh) {
            if (child.name.includes("wall")) {
              child.material = child.material.clone();
              child.material.metalness = 0.5;
              child.material.roughness = 0.6;
            }
          }

          //* 突起壁
          if (child.isMesh) {
            if (child.name.includes("hara")) {
              child.material = child.material.clone();
              child.material.metalness = 0.5;
              child.material.roughness = 0.8;
            }
          }

          //* 地面
          const targets = ["ground", "hei", "block"];

          if (child.isMesh) {
            if (targets.some((target) => child.name.includes(target))) {
              child.material = child.material.clone();
              child.material.metalness = 0.3;
              child.material.roughness = 0.8;
            }
          }

          //* 木枠
          if (child.isMesh) {
            if (child.name.includes("wood_frame")) {
              child.material = child.material.clone();
              child.material.metalness = 0.4;
              child.material.roughness = 0.8;
            }
          }

          //* サインポール
          if (child.isMesh) {
            if (child.name.includes("pole_glass")) {
              child.material = child.material.clone();
              child.material.metalness = 0.5;
              child.material.roughness = 0.3;
              child.material.transparent = true;
              child.material.needsUpdate = true;
              child.material.opacity = 0.3;
            }
          }

          //* 自転車
          const bicycle = ["body_frame", "cover", "spoke", "pedal", "stand"];

          if (child.isMesh) {
            if (bicycle.some((name) => child.name.includes(name))) {
              child.material = child.material.clone();
              child.material.metalness = 0.5;
              child.material.roughness = 0.4;
            }
          }

          // loadModel() の traverse 内に追記するだけ
          if (child.name === "cloud") {
            const mat = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              side: THREE.DoubleSide, // 両面表示
            });

            child.material = mat;
            this.cloudMesh = child;
            this.cloudMesh.scale.set(2, 2, 2);
          }

          /*
          if (child.name === 'mesh_131') {
          child.material.color.set('red');
          }

          console.log(child.name, child.type);
          */
        }
      });

      this.scene.add(this.model);

      // 瞬き用
      this.scheduleBlink();

      // 各アニメーションのランダムタイマー
      this.scheduleAnimation("back", 40, 180);
      this.scheduleAnimation("yoko", 30, 60);
      this.scheduleAnimation("nobi", 60, 120);
      this.scheduleAnimation("swing", 30, 90);
      this.scheduleAnimation("code", 20, 50);
    });
  }

  //! キャラアニメーション
  scheduleAnimation(name, minSec, maxSec) {
    const delay = (Math.random() * (maxSec - minSec) + minSec) * 1000;
    setTimeout(() => {
      this.triggerAnimation(name);
      this.scheduleAnimation(name, minSec, maxSec);
    }, delay);
  }

  triggerAnimation(name) {
    const action = this.actions[name];
    const sitAction = this.actions["sit"];
    if (!action || !sitAction) return;

    // code（配線）は排他制御から外す
    if (name === "code") {
      action.reset().play();
      return;
    }

    // 修正: isRunning()ではなくフラグで割り込み中かを判定
    if (this.isInterrupting) return;
    this.isInterrupting = true;

    // 修正: reset().play() → crossFadeTo の順番で呼ぶ
    action.reset().play();
    sitAction.crossFadeTo(action, 0.5, false); // 修正: warp=false で速度変化を防ぐ

    // nobiの場合のテクスチャ切り替えギミック
    if (name === "nobi") {
      setTimeout(() => {
        this.faceMesh.material.map = this.closedEyesTexture;
      }, 500);
      setTimeout(() => {
        this.faceMesh.material.map = this.regularTexture;
      }, 3000);
    }

    const onFinished = (e) => {
      if (e.action === action) {
        this.mixer.removeEventListener("finished", onFinished);
        this.returnToSit(action);
      }
    };
    this.mixer.addEventListener("finished", onFinished);
  }

  returnToSit(fromAction) {
    const sitAction = this.actions["sit"];

    // 修正: crossFadeTo ではなく fadeOut/fadeIn を個別に呼ぶ
    // (fromAction は clamp で paused 状態なので crossFadeTo が効かないため)
    fromAction.fadeOut(0.5);
    sitAction.reset().fadeIn(0.5).play();

    // フェード完了後にフラグを解除
    setTimeout(() => {
      this.isInterrupting = false;
    }, 500);
  }

  // 瞬きのスケジューラー（2〜5秒にランダムで1回）
  scheduleBlink() {
    const delay = (Math.random() * 8 + 4) * 1000;
    setTimeout(() => {
      this.blink();
      this.scheduleBlink();
    }, delay);
  }

  // 瞬き: sit中かつ割り込みアニメーションがない時だけ実行
  blink() {
    if (this.isInterrupting || !this.faceMesh) return;
    this.faceMesh.material.map = this.closedEyesTexture;
    this.faceMesh.material.needsUpdate = true;
    setTimeout(() => {
      this.faceMesh.material.map = this.regularTexture;
      this.faceMesh.material.needsUpdate = true;
    }, 150);
  }

  //! 毎フレーム更新処理
  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }

    if (this.poleMaterial) {
      this.poleMaterial.uniforms.time.value += 0.02;
    }

    //* 雲のループ
    if (this.cloudMesh) {
      this.cloudTime = (this.cloudTime || 0) + delta;

      const range = 40;
      const initialX = this.dirLight1.position.x - 10; // ← 初期位置はここで調整

      const offset = (this.cloudTime * 0.2) % range;
      this.cloudMesh.position.x = initialX + offset; // -で右→左、+で左→右

      //* ループした瞬間を検知してディレイをかける
      if (offset < this.lastOffset) {
        // offsetがリセットされた＝ループした
        this.cloudDelay = Math.random() * 10 + 5; // 5〜15秒のランダム待機
      }
      this.lastOffset = offset;

      if (this.cloudDelay > 0) {
        this.cloudDelay -= delta;
        this.cloudMesh.position.x = initialX; // 待機中は初期位置に置いておく
      }
    }
  }

  resize(width, height) {
    this.sizes.width = width;
    this.sizes.height = height;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();
  }

  setupSmokeCurtain() {
  this.smokeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0.0 }, // 0.0(真っ黒な煙) 〜 1.0(完全に消滅)
      uAspect: { value: window.innerWidth / window.innerHeight }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0); // 画面全体にフィット
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform float uAspect;
      varying vec2 vUv;

      // 簡易的なノイズ関数
      float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }
      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = rand(i);
        float b = rand(i + vec2(0.0, 1.0));
        float c = rand(i + vec2(0.5, 0.9));
        float d = rand(i + vec2(0.0, 0.5));
        vec2 u = f*f*(3.0-1.5*f);
        return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
          // ★【最重要】横軸(vUv.x)にアスペクト比を掛け算した、補正済みの座標を作ります
          // これにより、スマホなどの縦長画面でも粒が縦長に変形しなくなります
          vec2 correctedUv = vec2(vUv.x * uAspect, vUv.y);

          // あなたが調整した最高の塵ノイズと砂嵐（補正済みUVを使用）
          float n = noise(correctedUv * 30.0) * 0.2 + noise(correctedUv * 20.0) * 0.4;
          float grain = rand(correctedUv * 1000.0) * 0.8; 
          n += grain;
          
          // ★中心点(0.5, 0.5)も横軸にアスペクト比を掛けて補正します
          // これにより、スマホ画面でも楕円にならず、綺麗な「真円」で真ん中から崩壊が広がります
          float dist = distance(correctedUv, vec2(0.5 * uAspect, 0.5));
          float progress = uProgress * 2.8;
          
          float alpha = smoothstep(0.0, 0.03, n + (dist * 1.5) - progress + 0.1);
          
          gl_FragColor = vec4(vec3(0.0), alpha);
        }
    `
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  this.smokeMesh = new THREE.Mesh(geometry, this.smokeMaterial);
  this.smokeMesh.renderOrder = 9999; // 最前面に描画
  this.scene.add(this.smokeMesh);
}
}
