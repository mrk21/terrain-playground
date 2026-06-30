// biome-ignore-all lint/style/noExcessiveLinesPerFile: 四分木 LOD の探索・キャッシュ・退避・ビルドキューは毎フレームの可変状態(cache/frame/view)を密に共有する一体の中核。GL配線(node-buffers)・幾何(node-mesh)・カメラ(terrain-camera)・定数(terrain3d-config)を分離した残りで、これ以上割ると状態がモジュール跨ぎで散らばり可読性を損なう。
/**
 * 地形をクアッドツリー LOD で覆うノード群の管理（生成・選択・キャッシュ）。
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
 *
 * 描画ループ（scene）からは collect()→maintain() の順に毎フレーム呼ぶ。GL の
 * シェーダ/MVP/描画コールは scene が持ち、ここはノードの頂点バッファ群だけを所有する。
 */
import type { HeightMapFunc } from "../../algorithm/height";
import { aabbInFrustum, pointToAabbDistance } from "./culling";
import { createNodeBuffers, type NodeBuffers } from "./node-buffers";
import {
  BOX_MAX_Y,
  BOX_MIN_Y,
  BUILD_BUDGET,
  CACHE_CAPACITY,
  LEAF_GRID,
  MAX_DEPTH,
  PIXEL_BUDGET,
  ROOT_RADIUS,
  ROOT_SIZE,
} from "./terrain3d-config";

/** 1 ノードの GL リソースに、LRU 用の最終使用フレームを足したもの。 */
export interface TerrainNode extends NodeBuffers {
  lastUsed: number;
}

/** 描画ノード選択に要る、このフレームのカメラ由来の状態。 */
export interface CameraView {
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  /** clientHeight / (2*tan(FOV/2))。三角形のピクセル投影サイズ算出に使う。 */
  screenK: number;
  /** 視錐台 6 面（24 要素）。フラスタムカリングに使う。 */
  planes: Float32Array;
}

/** クアッドツリー LOD のノード管理。scene から毎フレーム駆動する。 */
export interface TerrainTiles {
  /** 全ノード共通の index 数（描画コールの要素数）。 */
  readonly indexCount: number;
  /** 現在のキャッシュ保持ノード数（HUD 表示用）。 */
  readonly size: number;
  /** このフレームの描画ノード（重なり・穴なしの覆い）を集めて返す。 */
  collect(view: CameraView): TerrainNode[];
  /** 不足ノードを手前優先で生成し、超過分を LRU で解放する。collect の後に呼ぶ。 */
  maintain(): void;
  /** 直近の collect で目標解像度まで収束したか（粗いフォールバックが残っていない）。 */
  settled(): boolean;
  /** 高さ関数を差し替える（既存ノードを破棄し、次フレームで生成し直す）。 */
  setHeight(next: HeightMapFunc): void;
  /** 全ノードと index バッファを解放する。 */
  dispose(): void;
}

const nodeKey = (depth: number, nx: number, nz: number): string =>
  `${depth}:${nx}:${nz}`;

export function createTerrainTiles(
  gl: WebGL2RenderingContext,
  heightFunc: HeightMapFunc,
): TerrainTiles {
  // 高さ関数は setHeight() で差し替えられる。メッシュはこの関数でサンプリングする。
  let height = heightFunc;

  // 1 ノードの GL バッファ生成・解放は node-buffers に委譲する。
  const buffers = createNodeBuffers(gl);

  const cache = new Map<string, TerrainNode>();
  let frame = 0;
  let builtThisFrame = 0;
  // このフレームで「子が未準備のため粗い親で代替描画した」回数。0 なら収束済み。
  let pendingRefine = 0;

  // 手前優先のビルドキュー。各フレーム、描画に必要だが未生成の「目標 LOD の葉」を
  // ここに積み、カメラに近い順（dist 昇順）に BUILD_BUDGET 個だけ生成する。
  interface BuildReq {
    depth: number;
    nx: number;
    nz: number;
    dist: number;
  }
  const buildQueue: BuildReq[] = [];

  // このフレームのカメラ状態（collect 冒頭で view から取り込む）。
  let eyeX = 0;
  let eyeY = 0;
  let eyeZ = 0;
  let screenK = 1;
  let planes: Float32Array = new Float32Array(24);

  const buildNode = (depth: number, nx: number, nz: number): TerrainNode => ({
    ...buffers.build(height, depth, nx, nz),
    lastUsed: frame,
  });

  const disposeNode = (node: TerrainNode): void => buffers.dispose(node);

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
    indexCount: buffers.indexCount,
    get size() {
      return cache.size;
    },
    collect(view) {
      eyeX = view.eyeX;
      eyeY = view.eyeY;
      eyeZ = view.eyeZ;
      screenK = view.screenK;
      planes = view.planes;
      frame++;
      builtThisFrame = 0;
      pendingRefine = 0;
      buildQueue.length = 0;

      // 視錐台に入りうるルート群から四分木を辿って描画ノードを収集。
      const out: TerrainNode[] = [];
      const rcx = Math.floor(eyeX / ROOT_SIZE);
      const rcz = Math.floor(eyeZ / ROOT_SIZE);
      for (let dz = -ROOT_RADIUS; dz <= ROOT_RADIUS; dz++) {
        for (let dx = -ROOT_RADIUS; dx <= ROOT_RADIUS; dx++) {
          selectRender(0, rcx + dx, rcz + dz, out);
        }
      }
      return out;
    },
    maintain() {
      drainBuildQueue();
      evictCache();
    },
    settled() {
      return pendingRefine === 0;
    },
    setHeight(next) {
      height = next;
      // 既存ノードは古い高さ関数で焼かれているので破棄。次フレームで生成し直す。
      for (const node of cache.values()) disposeNode(node);
      cache.clear();
    },
    dispose() {
      for (const node of cache.values()) disposeNode(node);
      cache.clear();
      buffers.disposeShared();
    },
  };
}
