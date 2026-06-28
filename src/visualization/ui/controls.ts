import {
  defaultValues,
  GENERATORS,
  generatorById,
  type HeightMapGenerator,
  type ParamDef,
} from "../../algorithm/generators";
import type { HeightMapFunc } from "../../algorithm/height";
import { makeSeed } from "../../algorithm/noise/hash-function";

/**
 * 画面上の操作 UI（ジェネレータのタブ・2D/3D トグル・パラメータパネル）を組み立て、
 * 状態を URL クエリと同期する。実際の描画反映はコールバックで main に委ねる。
 *   - ビュー変更 → onView：シーンを作り直す（2D と 3D はシーン型が違う）。
 *   - ジェネレータ/パラメータ変更 → onHeight：シーンの setHeight でカメラを保ったまま反映。
 */

export type ViewKey = "2d" | "3d";

export interface ControlsOptions {
  /** ビュー（2D/3D）が変わった。height を渡すのでシーンを作り直す。 */
  onView(view: ViewKey, height: HeightMapFunc): void;
  /** 高さ関数が変わった（ジェネレータ/パラメータ変更）。シーンに反映する。 */
  onHeight(height: HeightMapFunc): void;
}

export interface ControlsHandle {
  /** 最初に生成すべきビューと高さ関数。 */
  view: ViewKey;
  height: HeightMapFunc;
}

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "3d", label: "地形3D" },
  { key: "2d", label: "地形2D" },
];

/** 浮動小数の表示・保存用に程よく丸める（スライダーの刻み誤差を消す）。 */
function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export function initControls(opts: ControlsOptions): ControlsHandle {
  const query = new URLSearchParams(location.search);

  let view: ViewKey = query.get("view") === "2d" ? "2d" : "3d";
  // 既定は fBm（地形らしい見た目。Island は動作確認用の仮実装）。
  let gen = generatorById(query.get("gen") ?? "fbm");

  // ジェネレータごとのパラメータ値（セッション中は記憶）。初期ジェネレータのみ URL で上書き。
  const valuesByGen: Record<string, Record<string, number>> = {};
  for (const g of GENERATORS) valuesByGen[g.id] = defaultValues(g);
  for (const p of gen.params) {
    const raw = query.get(p.key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) valuesByGen[gen.id][p.key] = n;
    }
  }

  const buildHeight = (): HeightMapFunc => gen.make(valuesByGen[gen.id]);

  const syncUrl = (): void => {
    const q = new URLSearchParams();
    q.set("gen", gen.id);
    q.set("view", view);
    for (const p of gen.params)
      q.set(p.key, String(valuesByGen[gen.id][p.key]));
    history.replaceState(null, "", `?${q.toString()}`);
  };

  // --- DOM コンテナ ---
  const tabsEl = document.querySelector("#tabs")!;
  const viewEl = document.querySelector("#ui")!;
  const paramsEl = document.querySelector("#params")!;
  const paramsToggle =
    document.querySelector<HTMLButtonElement>("#params-toggle")!;
  const cameraEl = document.querySelector<HTMLElement>("#camera")!;

  // ジェネレータのタブ。
  const tabButtons = GENERATORS.map((g) => {
    const b = document.createElement("button");
    b.className = "tab";
    b.textContent = g.label;
    b.dataset.gen = g.id;
    b.addEventListener("click", () => selectGen(g));
    tabsEl.appendChild(b);
    return b;
  });

  // 2D/3D トグル。
  const viewButtons = VIEWS.map((v) => {
    const b = document.createElement("button");
    b.textContent = v.label;
    b.dataset.view = v.key;
    b.addEventListener("click", () => selectView(v.key));
    viewEl.appendChild(b);
    return b;
  });

  const refreshActive = (): void => {
    for (const b of tabButtons)
      b.classList.toggle("active", b.dataset.gen === gen.id);
    for (const b of viewButtons)
      b.classList.toggle("active", b.dataset.view === view);
  };

  const commitHeight = (): void => {
    syncUrl();
    opts.onHeight(buildHeight());
  };

  // パラメータフォームの開閉（右列の設定アイコン）。狭い画面は初期状態を閉じておく。
  let paramsOpen = window.innerWidth >= 700;
  const applyParamsVisibility = (): void => {
    const hasParams = gen.params.length > 0;
    // パラメータのないジェネレータ（Island）はアイコンを無効化（消さずに位置を保つ）。
    paramsToggle.disabled = !hasParams;
    paramsToggle.classList.toggle("active", hasParams && paramsOpen);
    paramsEl.classList.toggle("hidden", !hasParams || !paramsOpen);
  };
  paramsToggle.addEventListener("click", () => {
    paramsOpen = !paramsOpen;
    applyParamsVisibility();
  });

  const makeParamRow = (
    p: ParamDef,
    values: Record<string, number>,
  ): HTMLElement => {
    const row = document.createElement("div");
    row.className = "param-row";
    const label = document.createElement("label");
    label.textContent = p.label;
    row.appendChild(label);

    if (p.kind === "seed") {
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = "1";
      input.value = String(values[p.key]);
      input.className = "param-seed";
      input.addEventListener("change", () => {
        const n = Math.floor(Number(input.value));
        if (!Number.isFinite(n)) return;
        values[p.key] = n;
        commitHeight();
      });

      const dice = document.createElement("button");
      dice.className = "dice";
      dice.textContent = "🎲";
      dice.title = "ランダム";
      dice.addEventListener("click", () => {
        const n = makeSeed();
        values[p.key] = n;
        input.value = String(n);
        commitHeight();
      });

      row.appendChild(input);
      row.appendChild(dice);
    } else {
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step);
      input.value = String(values[p.key]);

      const valEl = document.createElement("span");
      valEl.className = "param-value";
      valEl.textContent = String(values[p.key]);

      input.addEventListener("input", () => {
        const n = round(Number(input.value));
        values[p.key] = n;
        valEl.textContent = String(n);
        commitHeight();
      });

      row.appendChild(input);
      row.appendChild(valEl);
    }
    return row;
  };

  const buildParamsPanel = (): void => {
    paramsEl.replaceChildren();
    const values = valuesByGen[gen.id];
    for (const p of gen.params) paramsEl.appendChild(makeParamRow(p, values));

    if (gen.params.length > 0) {
      // 初期値に戻すボタン（seed は現状維持。変えたいときは🎲を使う）。
      const reset = document.createElement("button");
      reset.className = "reset";
      reset.textContent = "初期値に戻す";
      reset.addEventListener("click", () => {
        const current = valuesByGen[gen.id];
        const defaults = defaultValues(gen);
        for (const p of gen.params) {
          if (p.kind === "seed") defaults[p.key] = current[p.key]; // seed は保持。
        }
        valuesByGen[gen.id] = defaults;
        buildParamsPanel(); // 入力欄を作り直して新しい値を反映。
        commitHeight();
      });
      paramsEl.appendChild(reset);
    }

    applyParamsVisibility(); // フォームの有無・開閉状態を反映。
  };

  function selectGen(g: HeightMapGenerator): void {
    if (g.id === gen.id) return;
    gen = g;
    buildParamsPanel();
    refreshActive();
    commitHeight(); // 同じビュー（シーン型）なので setHeight で反映できる。
  }

  function selectView(v: ViewKey): void {
    if (v === view) return;
    view = v;
    refreshActive();
    syncUrl();
    opts.onView(view, buildHeight());
  }

  // 右列（設定アイコン・方位磁針…）の先頭を、フォーム上端（= 2D/3D 行の下）に合わせる。
  // ボタンの実寸はフォントで変わるので #ui の実測位置から決める（#panel の gap は 8px）。
  const alignRightColumn = (): void => {
    const bottom = viewEl.getBoundingClientRect().bottom;
    cameraEl.style.top = `${Math.round(bottom + 8)}px`;
  };

  buildParamsPanel();
  refreshActive();
  syncUrl();
  alignRightColumn();
  window.addEventListener("resize", alignRightColumn);

  return { view, height: buildHeight() };
}
