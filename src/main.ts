import './style.css'
import { createContext, resizeToDisplay } from './gl/context'
import type { Scene, SceneFactory } from './scenes/scene'
import { createSceneHeightmap3D } from './scenes/scene-heightmap3d'
import { createSceneHeightmap } from './scenes/scene-heightmap'

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!
const gl = createContext(canvas)

const factories: Record<string, SceneFactory> = {
  heightmap3d: createSceneHeightmap3D,
  heightmap: createSceneHeightmap,
}

let current: Scene = createSceneHeightmap3D(gl)
let currentKey = 'heightmap3d'

function switchScene(key: string): void {
  const factory = factories[key]
  if (!factory || key === currentKey) return
  current.dispose()
  current = factory(gl)
  currentKey = key
  updateButtons()
}

// --- UI（シーン切り替えボタン） ---
const buttons = [...document.querySelectorAll<HTMLButtonElement>('#ui button')]
const hint = document.querySelector<HTMLElement>('#hint')
// マウス操作のヒントは、パン・ズームできるシーンでのみ表示する。
const scenesWithControls = new Set(['heightmap3d', 'heightmap'])
function updateButtons(): void {
  for (const btn of buttons) {
    btn.classList.toggle('active', btn.dataset.scene === currentKey)
  }
  hint?.classList.toggle('hidden', !scenesWithControls.has(currentKey))
}
for (const btn of buttons) {
  btn.addEventListener('click', () => switchScene(btn.dataset.scene ?? ''))
}
updateButtons()

// --- 描画ループ ---
let startTime: number | null = null
function frame(now: number): void {
  if (startTime === null) startTime = now
  const time = (now - startTime) / 1000

  resizeToDisplay(canvas)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  current.render(time)

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
