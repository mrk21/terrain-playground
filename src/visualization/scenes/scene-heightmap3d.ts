import type { HeightMapFunc } from "../../algorithm/height";
import { MAX_HEIGHT } from "../../core/colormap";
import * as mat4 from "../../core/math/mat4";
import { clamp } from "../../core/math/scalar";
import { createProgram } from "../gl/shader";
import { attachGestures } from "../input/gestures";
import fragSrc from "../shaders/terrain.frag?raw";
import vertSrc from "../shaders/terrain.vert?raw";
import {
  aabbInFrustum,
  extractFrustumPlanes,
  pointToAabbDistance,
} from "./culling";
import { buildGridIndices, perimeterIndices } from "./grid-mesh";
import type { Scene } from "./scene";

/**
 * 地形をクアッドツリー LOD で描く 3D シーン。
 *
 * ワールドを四分木のノードに分け、カメラの視錐台から再帰的に降りて
 * 「見えている範囲」だけを画面解像度に見合った数のノードで覆う。
 *   - 近い／大きく見えるノードは 4 分割して細かく、遠いノードは粗いまま。
 *   - 視錐台に入らないノードは辿らない（フラスタムカリング）。
 *   - 子が揃うまでは親（粗い）を描くので、穴も重なり（z-fighting）も出ない。
 *   - 不足ノードはカメラに近い順（手前優先）に、粗→細へ 1 階層ずつ生成するので、
 *     手前から連続的に解像していく。
 *   - 視界外に出たノードもしばらくキャッシュに残す（LRU）。回転・パン・ズームで
 *     戻っても即再利用でき、作り直しによるちらつき・カクつきが出ない。
 *   - LOD 差の継ぎ目はスカート（縁を下に垂らす壁）で隠す。
 * これにより、ズームしても描画コストがほぼ一定になる。
 */

/** 各ノードのメッシュ解像度（固定）。詳細はノードの世界サイズの分割で出す。 */
const LEAF_GRID = 64;
const N = LEAF_GRID + 1;
/** 深さ0（ルート）ノードの一辺のワールド長。深くなるほど半分になる。 */
const ROOT_SIZE = 4096;
/** 最大分割深さ（= 最小ノードサイズ ROOT_SIZE/2^MAX_DEPTH）。 */
const MAX_DEPTH = 10;
/** 1 三角形の目標最大サイズ（CSS ピクセル）。小さいほど高精細・多ノード（重い）。 */
const PIXEL_BUDGET = 2;

/** 垂直方向の誇張スケール。geometry の y のみに掛かる（色は真の高さのまま）。 */
const HEIGHT_SCALE = 0.2;
/** スカートの深さ（スケール後の y）。地形の全高(≈25.6)より深くして、どんな段差も隠す。 */
const SKIRT_DEPTH = 32;

/** 注視点の高さ（一定）。地形の中央高さに固定（パン時の縦揺れ防止）。 */
const TARGET_Y = (MAX_HEIGHT / 2) * HEIGHT_SCALE;

/** カメラ（視点）パラメータ。 */
const FOV = Math.PI / 4;
const FAR = 5000;
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 1500;
/** 1 フレームに新規生成するノード数（ビルドキューの上位＝手前優先で消化する）。 */
const BUILD_BUDGET = 16;
/**
 * ノードキャッシュの保持上限（個数）。視界外・別 LOD に外れたノードを即捨てず、
 * この数までは残して LRU で間引く。回転・パン・ズームで戻ったとき、作り直さず
 * 即再利用するため（Google Maps 風に「一度読んだタイルは残す」挙動）。
 * 高解像度ビューポートでの可視ノード数（~300）の上に保持分の余裕を確保する。
 * 注: 描画に必要なノードは lastUsed で必ず保護されるので、この値は「保持量 vs メモリ」
 * のチューニングであって、小さくても描画は壊れない（保持の効きが弱まるだけ）。
 */
const CACHE_CAPACITY = 512;
/** ルートを探索する範囲（カメラのルートセルから ±ROOT_RADIUS）。 */
const ROOT_RADIUS = 2;

/** AABB の y 範囲（スカート下端〜地形最大高）。 */
const BOX_MIN_Y = -SKIRT_DEPTH;
const BOX_MAX_Y = MAX_HEIGHT * HEIGHT_SCALE;

/** 真の高さを地形の有効レンジ [0, MAX_HEIGHT] に収める。 */
function clampHeight(y: number): number {
  return clamp(y, 0, MAX_HEIGHT);
}

interface NodeMesh {
  positions: Float32Array;
  normals: Float32Array;
  heights: Float32Array; // 真の高さ(0..128)。色はフラグメントで決める。
}

interface TerrainNode {
  vao: WebGLVertexArrayObject;
  posBuf: WebGLBuffer;
  norBuf: WebGLBuffer;
  hgtBuf: WebGLBuffer;
  lastUsed: number;
}

const nodeKey = (depth: number, nx: number, nz: number): string =>
  `${depth}:${nx}:${nz}`;

export function createSceneHeightmap3D(
  gl: WebGL2RenderingContext,
  heightFunc: HeightMapFunc,
): Scene {
  // 高さ関数は setHeight() で差し替えられる。メッシュはこの関数でサンプリングする。
  let height = heightFunc;

  /** 原点 (ox,oz)・一辺 size のノードのメッシュを LEAF_GRID で作る。 */
  const buildNodeMesh = (ox: number, oz: number, size: number): NodeMesh => {
    const spacing = size / LEAF_GRID;

    // 縁を 1 つ含む高さグリッド（(N+2)²）。法線の境界一致のため。
    const B = N + 2;
    const hb = new Float32Array(B * B);
    for (let j = -1; j <= N; j++) {
      const wz = oz + j * spacing;
      for (let i = -1; i <= N; i++) {
        const wx = ox + i * spacing;
        hb[(j + 1) * B + (i + 1)] = clampHeight(height(wx, wz));
      }
    }
    const at = (i: number, j: number): number => hb[(j + 1) * B + (i + 1)];

    const peri = perimeterIndices(N);
    const vcount = N * N + peri.length;
    const positions = new Float32Array(vcount * 3);
    const normals = new Float32Array(vcount * 3);
    const heights = new Float32Array(vcount);

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const y = at(i, j);
        positions[idx * 3] = ox + i * spacing;
        positions[idx * 3 + 1] = y * HEIGHT_SCALE;
        positions[idx * 3 + 2] = oz + j * spacing;

        const dhdx =
          ((at(i + 1, j) - at(i - 1, j)) * HEIGHT_SCALE) / (2 * spacing);
        const dhdz =
          ((at(i, j + 1) - at(i, j - 1)) * HEIGHT_SCALE) / (2 * spacing);
        const nx = -dhdx;
        const nz = -dhdz;
        const len = Math.hypot(nx, 1, nz) || 1;
        normals[idx * 3] = nx / len;
        normals[idx * 3 + 1] = 1 / len;
        normals[idx * 3 + 2] = nz / len;

        heights[idx] = y;
      }
    }

    // スカート：外周頂点を真下に落としたコピー。
    for (let k = 0; k < peri.length; k++) {
      const s = peri[k];
      const d = N * N + k;
      positions[d * 3] = positions[s * 3];
      positions[d * 3 + 1] = positions[s * 3 + 1] - SKIRT_DEPTH;
      positions[d * 3 + 2] = positions[s * 3 + 2];
      normals[d * 3] = normals[s * 3];
      normals[d * 3 + 1] = normals[s * 3 + 1];
      normals[d * 3 + 2] = normals[s * 3 + 2];
      heights[d] = heights[s];
    }

    return { positions, normals, heights };
  };

  const program = createProgram(gl, vertSrc, fragSrc);
  const uMvp = gl.getUniformLocation(program, "uMvp");

  // 全ノード共通の index バッファ。
  const indices = buildGridIndices(LEAF_GRID);
  const indexCount = indices.length;
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  const makeBuffer = (
    location: number,
    data: Float32Array,
    size: number,
  ): WebGLBuffer => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buffer;
  };

  const cache = new Map<string, TerrainNode>();
  let frame = 0;
  let builtThisFrame = 0;
  // このフレームで「子が未準備のため粗い親で代替描画した」回数。0 なら収束済み。
  let pendingRefine = 0;
  let settled = false;

  // 手前優先のビルドキュー。各フレーム、描画に必要だが未生成の「目標 LOD の葉」を
  // ここに積み、カメラに近い順（dist 昇順）に BUILD_BUDGET 個だけ生成する。
  interface BuildReq {
    depth: number;
    nx: number;
    nz: number;
    dist: number;
  }
  const buildQueue: BuildReq[] = [];

  const buildNode = (depth: number, nx: number, nz: number): TerrainNode => {
    const size = ROOT_SIZE / 2 ** depth;
    const mesh = buildNodeMesh(nx * size, nz * size, size);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuf = makeBuffer(0, mesh.positions, 3);
    const norBuf = makeBuffer(1, mesh.normals, 3);
    const hgtBuf = makeBuffer(2, mesh.heights, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bindVertexArray(null);
    return { vao, posBuf, norBuf, hgtBuf, lastUsed: frame };
  };

  const disposeNode = (node: TerrainNode): void => {
    gl.deleteVertexArray(node.vao);
    gl.deleteBuffer(node.posBuf);
    gl.deleteBuffer(node.norBuf);
    gl.deleteBuffer(node.hgtBuf);
  };

  // --- カメラ状態（ドラッグでパン・ホイールでズーム・Shift+ドラッグで回転） ---
  // 初期値（リセット用に保持）。yaw=0 で北が上、pitch=PI/2 で真上から見下ろす。
  const INIT_YAW = 0; // 2D と同じ向き（軸そろい）。回転していると斜めに見えるため。
  const INIT_PITCH = Math.PI / 2; // 初期は真上から見下ろす（2D と同じ向き）
  // 真上ビューの見える縦幅 = 2*distance*tan(FOV/2)。これを 2D の表示高さ(200) に合わせる。
  const INIT_DISTANCE = 200 / (2 * Math.tan(FOV / 2));
  const INIT_TARGET: readonly [number, number, number] = [0, TARGET_Y, 0];

  let yaw = INIT_YAW;
  let pitch = INIT_PITCH;
  let distance = INIT_DISTANCE;
  const target: [number, number, number] = [...INIT_TARGET];
  let eyeX = 0;
  let eyeY = 0;
  let eyeZ = 0;
  let screenK = 1;
  const planes = new Float32Array(24);

  // ノード中心ではなく、AABB の最近点までの距離（近い縁で十分分割させる）。
  // 1 未満は 1 に丸める（カメラが箱に入っても 0 除算・過分割しない）。
  const nearestDist = (ox: number, oz: number, size: number): number =>
    Math.max(
      1,
      pointToAabbDistance(
        eyeX,
        eyeY,
        eyeZ,
        ox,
        ox + size,
        BOX_MIN_Y,
        BOX_MAX_Y,
        oz,
        oz + size,
      ),
    );

  // 画面上で三角形が PIXEL_BUDGET を超えるなら分割すべき。
  const shouldSubdivide = (depth: number, nx: number, nz: number): boolean => {
    if (depth >= MAX_DEPTH) return false;
    const size = ROOT_SIZE / 2 ** depth;
    const triWorld = size / LEAF_GRID;
    const d = nearestDist(nx * size, nz * size, size);
    return (triWorld * screenK) / d > PIXEL_BUDGET;
  };

  const inFrustum = (depth: number, nx: number, nz: number): boolean => {
    const size = ROOT_SIZE / 2 ** depth;
    const ox = nx * size;
    const oz = nz * size;
    return aabbInFrustum(
      planes,
      ox,
      ox + size,
      BOX_MIN_Y,
      BOX_MAX_Y,
      oz,
      oz + size,
    );
  };

  // 4 つの子がすべて coverable か（＝穴も重なりもなく子に降りられるか）。
  const allChildrenCoverable = (
    depth: number,
    nx: number,
    nz: number,
  ): boolean => {
    const cd = depth + 1,
      cx = nx * 2,
      cz = nz * 2;
    return (
      coverable(cd, cx, cz) &&
      coverable(cd, cx + 1, cz) &&
      coverable(cd, cx, cz + 1) &&
      coverable(cd, cx + 1, cz + 1)
    );
  };

  // このノードが「描画可能（自分が生成済み or 子で完全に覆える）」か。副作用なし。
  const coverable = (depth: number, nx: number, nz: number): boolean => {
    if (!inFrustum(depth, nx, nz)) return true; // 視錐台外＝覆う必要なし
    if (cache.has(nodeKey(depth, nx, nz))) return true;
    if (!shouldSubdivide(depth, nx, nz)) return false; // 末端なのに未生成
    return allChildrenCoverable(depth, nx, nz);
  };

  // 粗いノードを描いたとき、その直下の子（リファインのフロンティア）をビルド要求する。
  // 中間を飛ばさず 1 階層ずつ降ろすので、子が 1 つ生成されただけで coverable になり、
  // 粗→細へ連続的に解像する（全か無かにならない）。
  //   - 生成済みの子は使用印（lastUsed）だけ更新して保持する。揃うまでに他の兄弟を
  //     待つ間、LRU に「未使用」と誤判定されて捨てられないようにするため（重要）。
  //   - 未生成の子は dist（カメラ最近点距離）付きで積み、フレーム末に近い順で消化する。
  const enqueueChildren = (depth: number, nx: number, nz: number): void => {
    const cd = depth + 1;
    const size = ROOT_SIZE / 2 ** cd;
    for (let c = 0; c < 4; c++) {
      const cx = nx * 2 + (c & 1);
      const cz = nz * 2 + (c >> 1);
      if (!inFrustum(cd, cx, cz)) continue;
      const existing = cache.get(nodeKey(cd, cx, cz));
      if (existing) {
        existing.lastUsed = frame;
        continue;
      }
      buildQueue.push({
        depth: cd,
        nx: cx,
        nz: cz,
        dist: nearestDist(cx * size, cz * size, size),
      });
    }
  };

  // 生成済みなら取得、無ければ生成してキャッシュに入れ、使用印（lastUsed）を更新して返す。
  const ensureNode = (depth: number, nx: number, nz: number): TerrainNode => {
    const k = nodeKey(depth, nx, nz);
    let node = cache.get(k);
    if (!node) {
      node = buildNode(depth, nx, nz);
      cache.set(k, node);
    }
    node.lastUsed = frame;
    return node;
  };

  // 描画する分（= 利用可能な最深ノードの覆い）を集める。重なり・穴なし。
  const selectRender = (
    depth: number,
    nx: number,
    nz: number,
    out: TerrainNode[],
  ): void => {
    if (!inFrustum(depth, nx, nz)) return;

    // 末端（これ以上分割不要）→ 自分を描く。
    if (!shouldSubdivide(depth, nx, nz)) {
      out.push(ensureNode(depth, nx, nz));
      return;
    }

    const cd = depth + 1,
      cx = nx * 2,
      cz = nz * 2;
    if (allChildrenCoverable(depth, nx, nz)) {
      // 子が全部覆える → 降りる。自分はキャッシュ保持のため使用印だけ。
      const self = cache.get(nodeKey(depth, nx, nz));
      if (self) self.lastUsed = frame;
      selectRender(cd, cx, cz, out);
      selectRender(cd, cx + 1, cz, out);
      selectRender(cd, cx, cz + 1, out);
      selectRender(cd, cx + 1, cz + 1, out);
      return;
    }

    // 子が未準備 → 自分（粗い）を即描画し、直下の子を手前優先で生成要求する。
    // 次フレーム以降、近い方から 1 階層ずつ細かく描き換わる。
    pendingRefine++; // この代替が 1 つでもある間は未収束。
    out.push(ensureNode(depth, nx, nz)); // フォールバックは必ず用意（描画対象なので予算外）
    enqueueChildren(depth, nx, nz);
  };

  const canvas = gl.canvas as HTMLCanvasElement;

  // 画面上の点 (fx,fy)（canvas 相対 CSS px）が刺さる地表面 y=TARGET_Y のワールド座標。
  // ピンチで「指の下が動かない」ようにズーム量を合わせるのに使う。視線が上を向く
  // （地平線より上）など交わらない場合は null。dist を引数に取り、ズーム前後で使える。
  const groundUnder = (
    fx: number,
    fy: number,
    dist: number,
  ): [number, number] | null => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const aspect = w / h;
    const t2 = Math.tan(FOV / 2);
    const ndcX = (fx / w) * 2 - 1;
    const ndcY = 1 - (fy / h) * 2;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // カメラの正規直交基底（yaw,pitch から直接。真上ビューでも退化しない）。
    const fX = Math.sin(yaw) * cp,
      fY = -sp,
      fZ = -Math.cos(yaw) * cp; // forward
    const rX = Math.cos(yaw),
      rZ = Math.sin(yaw); // right（y成分は常に0）
    const uX = Math.sin(yaw) * sp,
      uY = cp,
      uZ = -Math.cos(yaw) * sp; // up
    const ax = ndcX * t2 * aspect;
    const ay = ndcY * t2;
    const dx = fX + rX * ax + uX * ay;
    const dy = fY + uY * ay;
    const dz = fZ + rZ * ax + uZ * ay;
    if (dy > -1e-4) return null; // 下を向いていない＝地表と交わらない
    const ex = target[0] - fX * dist; // eye = target - forward*dist
    const ey = target[1] - fY * dist;
    const ez = target[2] - fZ * dist;
    const tHit = (target[1] - ey) / dy;
    if (tHit <= 0) return null;
    return [ex + dx * tHit, ez + dz * tHit];
  };

  // factor>1 で拡大（distance を縮める）。焦点 (fx,fy) の地点が動かないよう target を補正。
  const zoomAt = (factor: number, fx: number, fy: number): void => {
    const before = groundUnder(fx, fy, distance);
    distance = clamp(distance / factor, MIN_DISTANCE, MAX_DISTANCE);
    if (!before) return;
    const after = groundUnder(fx, fy, distance);
    if (!after) return;
    // groundUnder は [x, z] を返す。target の x,z を補正。
    target[0] += before[0] - after[0];
    target[2] += before[1] - after[1];
  };

  const detachGestures = attachGestures(canvas, {
    onDrag(dx, dy, shift) {
      if (shift) {
        // デスクトップ：Shift+ドラッグで回転。
        yaw -= dx * 0.005;
        pitch = clamp(pitch - dy * 0.005, 0.15, Math.PI / 2);
        return;
      }
      const worldPerPx =
        (2 * distance * Math.tan(FOV / 2)) / canvas.clientHeight;
      const fwdX = Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      target[0] += (-rightX * dx + fwdX * dy) * worldPerPx;
      target[2] += (-rightZ * dx + fwdZ * dy) * worldPerPx;
    },
    onPinch(scale, fx, fy) {
      zoomAt(scale, fx, fy);
    },
    onTwist(dAngle) {
      // 2 本指のひねりに合わせて地図を回す。
      yaw -= dAngle;
    },
    onTilt(dy) {
      // 2 本指を上へ（dy<0）で地平線方向に倒す＝pitch を小さく。下へ戻すと真上ビュー。
      pitch = clamp(pitch + dy * 0.005, 0.15, Math.PI / 2);
    },
    onWheelZoom(deltaY, fx, fy) {
      zoomAt(Math.exp(-deltaY * 0.001), fx, fy);
    },
  });

  const hud = document.querySelector<HTMLElement>("#hud");

  const proj = mat4.create();
  const view = mat4.create();
  const mvp = mat4.create();
  const renderList: TerrainNode[] = [];

  // ビルドキューを手前（dist 小）優先で BUILD_BUDGET 個まで生成する。
  const drainBuildQueue = (): void => {
    buildQueue.sort((a, b) => a.dist - b.dist);
    for (const req of buildQueue) {
      if (builtThisFrame >= BUILD_BUDGET) break;
      const k = nodeKey(req.depth, req.nx, req.nz);
      if (cache.has(k)) continue; // フォールバックで既に生成済み
      cache.set(k, buildNode(req.depth, req.nx, req.nz));
      builtThisFrame++;
    }
  };

  // 容量超過分だけ、このフレーム未使用のノードを古い順（LRU）に解放する。
  // 戻ってきたときの再利用のため、超過していなければ視界外でも残す。
  const evictCache = (): void => {
    let over = cache.size - CACHE_CAPACITY;
    if (over <= 0) return;
    const idle: Array<[string, TerrainNode]> = [];
    for (const entry of cache) {
      if (entry[1].lastUsed !== frame) idle.push(entry);
    }
    idle.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [k, node] of idle) {
      if (over <= 0) break;
      disposeNode(node);
      cache.delete(k);
      over--;
    }
  };

  return {
    render() {
      frame++;
      builtThisFrame = 0;
      pendingRefine = 0;
      buildQueue.length = 0;
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.45, 0.62, 0.82, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // カメラ位置。
      const cp = Math.cos(pitch);
      eyeX = target[0] - Math.sin(yaw) * cp * distance;
      eyeY = target[1] + Math.sin(pitch) * distance;
      eyeZ = target[2] + Math.cos(yaw) * cp * distance;
      screenK = canvas.clientHeight / (2 * Math.tan(FOV / 2));

      const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      mat4.perspective(FOV, aspect, 0.5, FAR, proj);
      mat4.translation(0, 0, -distance, view);
      mat4.multiply(view, mat4.rotationX(pitch), view);
      mat4.multiply(view, mat4.rotationY(yaw), view);
      mat4.multiply(
        view,
        mat4.translation(-target[0], -target[1], -target[2]),
        view,
      );
      mat4.multiply(proj, view, mvp);
      extractFrustumPlanes(mvp, planes);

      // 視錐台に入りうるルート群から四分木を辿って描画ノードを収集。
      renderList.length = 0;
      const rcx = Math.floor(eyeX / ROOT_SIZE);
      const rcz = Math.floor(eyeZ / ROOT_SIZE);
      for (let dz = -ROOT_RADIUS; dz <= ROOT_RADIUS; dz++) {
        for (let dx = -ROOT_RADIUS; dx <= ROOT_RADIUS; dx++) {
          selectRender(0, rcx + dx, rcz + dz, renderList);
        }
      }

      // 不足ノードを手前優先で生成し、超過分だけ LRU で解放する。
      drainBuildQueue();
      evictCache();

      gl.useProgram(program);
      gl.uniformMatrix4fv(uMvp, false, mvp);
      for (const node of renderList) {
        gl.bindVertexArray(node.vao);
        gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);

      if (hud)
        hud.textContent = `nodes: ${renderList.length} / cache: ${cache.size}`;

      settled = pendingRefine === 0;
    },
    setHeight(next) {
      height = next;
      // 既存ノードは古い高さ関数で焼かれているので破棄。次フレームで生成し直す。
      for (const node of cache.values()) disposeNode(node);
      cache.clear();
    },
    resetView() {
      yaw = INIT_YAW;
      pitch = INIT_PITCH;
      distance = INIT_DISTANCE;
      target[0] = INIT_TARGET[0];
      target[1] = INIT_TARGET[1];
      target[2] = INIT_TARGET[2];
    },
    resetNorth() {
      // 位置・ズームは保ち、向きだけ北上・真上に戻す。
      yaw = INIT_YAW;
      pitch = INIT_PITCH;
    },
    getHeading() {
      return yaw;
    },
    isSettled() {
      return settled;
    },
    dispose() {
      detachGestures();
      for (const node of cache.values()) disposeNode(node);
      cache.clear();
      gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      if (hud) hud.textContent = "";
    },
  };
}
