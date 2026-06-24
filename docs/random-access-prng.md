# ランダムアクセス可能な疑似乱数（CBRNG とノイズ関数）

`GetPosValue = (pos: Vector2D) => number` のように、**任意の位置から直接ランダム値を引ける関数**は何と呼ばれるか、というメモ。Perlin noise を実装する上での背景知識。

## TL;DR

- `(index) => value` 型の「状態を持たず、任意の位置に O(1) でランダムアクセスできる疑似乱数列」は、乱数論では **counter-based PRNG (CBRNG)** / **stateless PRNG** / **seekable PRNG** と呼ばれる。
- グラフィックスの文脈では同じものを **hash function** / **noise function**（value noise / gradient noise）と呼ぶ。視点が違うだけで実体は同じ。
- permutation（全単射）ベースのものも CBRNG に**該当する**。むしろ AES-CTR / Threefry など正統派 CBRNG は permutation そのものが核。
- ただし **生の permutation を出力にすると「衝突ゼロ＝一様すぎる」痕跡で識別できる**（PRF vs PRP）。出力空間を広げるか、Perlin のようにインデックス用途に留めるのが定石。

## 通常の PRNG との違い

| | 通常の PRNG | ランダムアクセス型 |
|---|---|---|
| 形 | `state → (value, nextState)` | `f(index) → value` |
| 状態 | 内部状態を持つ（逐次的） | 状態なし（stateless / pure） |
| N番目の取得 | 先頭から N 回回す必要あり | 直接計算できる（seekable） |
| 並列化 | 難しい | 容易（位置ごとに独立計算） |
| 再現性 | シード依存 | 同じ index → 必ず同じ値 |

数学的には後者は単に「インデックス集合上で定義された決定論的関数」であり、**無限長で任意要素にランダムアクセスできる疑似乱数列**とみなせる。Perlin / Simplex noise が「再現可能・シード可能・タイル状に並列計算できる」のは、すべてこの stateless・seekable な性質に由来する。

## 呼び方（乱数論の文脈）

| 呼称 | ニュアンス |
|---|---|
| **Counter-based PRNG (CBRNG)** | 最も学術的に正確。`value = f(counter, key)` で N 番目を直接計算。「ランダムアクセス可能な疑似乱数列」とほぼ同義 |
| **Stateless / Pure-function PRNG** | 内部状態を持たず入力だけで出力が決まる点を強調 |
| **Seekable PRNG** | 任意位置に「シーク」できる能力に着目 |
| **Splittable RNG** | 系列を分割・派生できる近い概念（`SplitMix64` など） |

代表実装は **Philox / Threefry**（Salmon et al. 2011 *"Parallel Random Numbers: As Easy as 1, 2, 3"* / ライブラリ名 **Random123**）。「カウンタ = 位置」と読み替えれば、`GetPosValue` はまさに 2D カウンタを入力にした CBRNG。

## 呼び方（グラフィックス / 手続き型生成の文脈）

- **Hash function（空間ハッシュ / spatial hash）** … 座標から擬似乱数を引く部分そのもの
- **Noise function** … `R² → R` の決定論的な擬似乱数場
  - 格子点でハッシュ値を引く → **value noise**
  - 格子点で勾配を引く → **gradient noise**（Perlin はこちら）

つまり、

- 乱数論側から見れば → **counter-based / stateless PRNG**
- グラフィックス側から見れば → **hash function / noise function**

同じものを別の語彙で呼んでいる関係。

## permutation ベースは CBRNG か？ → 該当する

### 1. 暗号的 permutation（PRP / ブロック暗号）としての場合 → 王道

CBRNG の理論的王道は「キー付き全単射 = 疑似ランダム置換 (PRP)」をカウンタに適用するもの。

```
value = E_key(counter)      // CTR モード
```

- **AES-CTR** … AES は `{0,1}^128` 上の permutation。`counter = 0,1,2,…` に適用 → CSPRNG
- **Threefry**（Random123）… Threefish 暗号（= permutation）ベース
- **ARS**（Random123）… AES（= permutation）ベース

Philox を除けば、代表的 CBRNG はほぼ permutation。

### 2. Perlin の置換テーブル `P[256]` としての場合 → 同じ族だが格下

シャッフルされた `P[256]` を引くやつ:

```ts
hash = P[(x + P[y & 255]) & 255]
```

- 「状態を持たず、座標から決定論的に値を引く全単射の合成」なので**概念的には同じ族**（stateless / seekable な hash）。
- ただし暗号グレード CBRNG とは品質が段違い（周期 256、既知のアーティファクトあり）。ふつうは CBRNG ではなく **permutation hash / lookup-table hash** と呼ぶ。

## 重要な注意：permutation を「出力そのもの」にすると見破られる

| | 衝突 | 真の乱数との関係 |
|---|---|---|
| **PRF（疑似ランダム関数）** | あり | バースデーパラドックスで必ず衝突する＝本物に近い |
| **PRP（疑似ランダム置換 = permutation）** | **ゼロ** | 各出力値がちょうど1回ずつ＝一様すぎる痕跡が残る |

生の permutation をそのまま乱数値として出すと、「衝突が一切ない」という真の乱数にはあり得ない性質で識別可能になる（PRP/PRF switching lemma）。

実用上の回避策:

1. **出力空間を入力より十分広く取る** … AES なら 128bit、Threefry なら 64bit 出力。実際にサンプルする範囲では衝突確率が無視でき、PRF と区別不能になる。
2. **permutation の結果を最終出力にしない** … Perlin は `P[]` の結果を「どの勾配ベクトルを選ぶか」のインデックスにしか使わず、最終 noise 値は勾配・内挿で作る。だから 256 周期の全単射という弱さが表に出にくい。

## まとめ

- `GetPosValue` を一言で正確に呼ぶなら **counter-based (stateless) PRNG**。
- この Perlin プロジェクトの語彙なら **hash / noise function**。
- permutation ベースも CBRNG として完全にアリ（AES-CTR / Threefry が好例）。
- ただし生の permutation を晒すと PRP/PRF の差で見破られるので、出力を広げるか、インデックス用途に留めるのが定石。
- Perlin の `P[256]` は同じ族だが品質は低く、**permutation hash** と呼ぶのが正確。

## 参考

- Salmon, Moraes, Dror, Shaw, *"Parallel Random Numbers: As Easy as 1, 2, 3"* (SC '11) — Random123 / Philox / Threefry / ARS
- Ken Perlin, *"Improving Noise"* (SIGGRAPH 2002) — permutation table と gradient noise
