# fBm（フラクショナルブラウン運動）ノイズまとめ

地形の起伏は、周波数の違うノイズを何枚も重ねて作る。これを fBm（fractional Brownian motion）と呼ぶ。
1 枚 1 枚（オクターブ）は同じノイズ関数だが、重ねるたびに**周波数を上げ・振幅を下げる**ので、
大きなうねりの上に細かいディテールが乗る。

## オクターブを重ねるループ

各オクターブで周波数と振幅を更新しながら、ノイズ値を足し込んでいく。

```
  開始: total=0, freq=1, amp=1
     │
     ▼
  ┌─────────────────────────┐
  │ noise(x*freq, y*freq)*amp │  ← 1 オクターブ分を total に足す
  └─────────────────────────┘
     │
     ▼
  freq *= lacunarity（周波数を上げる）
  amp  *= persistence（振幅を下げる）
     │
     ▼
  i < octaves なら次のオクターブへ戻る／そうでなければ total を返す
```

## 振幅と周波数

オクターブ `i`（0 始まり）での振幅と周波数は、初期値に倍率を `i` 回かけたもの。

```
freq(i) = lacunarity^i
amp(i)  = persistence^i
fBm(x,y) = Σ[i=0..N-1] noise(x*freq(i), y*freq(i)) * amp(i)
```

`persistence < 1` なら高周波ほど効きが弱くなり、自然な減衰になる。

## オクターブの積み重なり（イメージ）

低周波（大きなうねり）の上に、振幅の小さい高周波が乗っていく様子。

```
振幅
 ^
 |  ████████████████   octave 0（低周波・大振幅）
 |    ▓▓▓▓  ▓▓▓▓       octave 1
 |     ░░ ░░ ░░ ░░     octave 2（高周波・小振幅）
 +-------------------> 周波数
```

## 実装

```ts
function fbm(x: number, y: number, o: Octaves): number {
  let total = 0;
  let freq = 1;
  let amp = 1;
  for (let i = 0; i < o.octaves; i++) {
    total += noise(x * freq, y * freq) * amp;
    freq *= o.lacunarity;
    amp *= o.persistence;
  }
  return total;
}
```

## パラメータ

| 定数 | 既定 | 意味 |
| --- | --- | --- |
| `octaves` | 5 | 重ねる枚数。多いほど細かいが重い |
| `lacunarity` | 2.0 | オクターブごとに周波数を何倍するか |
| `persistence` | 0.5 | オクターブごとに振幅を何倍するか |
