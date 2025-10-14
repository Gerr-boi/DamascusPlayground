'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import logo from "@/public/public/blacksmith_logo.png"


// ===================== Types & Materials =====================
type MaterialType =
  | '1084'
  | '15N20'
  | '1095'
  | '80CrV2'
  | '52100'
  | '5160'
  | 'PureNickel'
  | 'WroughtIron'

type Operation =
  | { kind: 'addSheets'; material: MaterialType; count: number }
  | { kind: 'twist'; turns: number } // turns = degrees / 360
  | { kind: 'ladder'; spacing: number; depth: number }
  | { kind: 'raindrops'; radius: number; spacing: number }
  | { kind: 'wfolds'; folds: number }
  | { kind: 'fold'; times: number }
  | { kind: 'stretch'; factor: number }

// Approximate etch brightness 0..1 (higher = lighter after etch)
const MATERIAL_CATALOG: Record<MaterialType, { name: string; etch: number }> = {
  '1084': { name: '1084', etch: 0.15 },
  '15N20': { name: '15N20', etch: 0.85 },
  '1095': { name: '1095', etch: 0.12 },
  '80CrV2': { name: '80CrV2', etch: 0.18 },
  '52100': { name: '52100', etch: 0.2 },
  '5160': { name: '5160', etch: 0.22 },
  'PureNickel': { name: 'Pure Nickel', etch: 0.95 },
  'WroughtIron': { name: 'Wrought Iron', etch: 0.35 },
}
const MATERIALS = MATERIAL_CATALOG // alias

// ===================== Pattern Generator (stylized) =====================
function generatePattern(
  layers: MaterialType[],
  ops: Operation[],
  width = 1024,
  height = 512
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  if (!layers.length) {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, width, height)
    return canvas
  }

  const repeats = layers.length
  const img = ctx.createImageData(width, height)
  const data = img.data as unknown as Uint8ClampedArray

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width // length direction
      const v = y / height // stack direction
      let uu = u
      let vv = v

      for (const op of ops) {
        if (op.kind === 'twist') {
          vv += (Math.sin(uu * Math.PI * 2 * op.turns) * 0.5) / Math.max(1, repeats)
        } else if (op.kind === 'ladder') {
          const t = (uu / Math.max(0.0001, op.spacing)) % 1
          const tri = 1 - Math.abs(0.5 - t) * 2 // 0..1..0
          vv -= tri * 0.25 * op.depth
        } else if (op.kind === 'raindrops') {
          const cx = Math.floor(uu / Math.max(0.0001, op.spacing))
          const cy = Math.floor(vv / Math.max(0.0001, op.spacing))
          const dx = uu - cx * op.spacing - op.spacing * 0.5
          const dy = vv - cy * op.spacing - op.spacing * 0.5
          const d = Math.sqrt(dx * dx + dy * dy)
          const influence = Math.max(0, 1 - d / Math.max(0.0001, op.radius))
          vv -= influence * 0.15
        } else if (op.kind === 'wfolds') {
          const w = op.folds
          const saw = ((uu * w) % 1) - 0.5
          vv = Math.abs(vv + saw * 0.5)
        } else if (op.kind === 'fold') {
          // Visual approximation: each fold doubles the layer frequency
          vv *= Math.pow(2, Math.max(0, Math.floor(op.times)))
        } else if (op.kind === 'stretch') {
          uu *= op.factor // compress features along length
        }
      }

      vv = ((vv % 1) + 1) % 1 // wrap 0..1

      const idx = Math.floor(vv * repeats)
      const mat = MATERIALS[layers[idx]]
      const s = Math.max(0, Math.min(1, mat.etch)) * 255
      const off = (y * width + x) * 4
      data[off] = s
      data[off + 1] = s
      data[off + 2] = s
      data[off + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

// Return an array for easier rendering
function instructionsFromOps(ops: Operation[]): string[] {
  const lines: string[] = []
  ops.forEach((op) => {
    switch (op.kind) {
      case 'addSheets':
        lines.push(`Stack ${op.count} sheet(s) of ${MATERIALS[op.material].name}.`)
        break
      case 'twist':
        lines.push(`Twist billet ~${op.turns} full turn(s).`)
        break
      case 'ladder':
        lines.push(`Ladder grind: spacing ${op.spacing}, depth ${op.depth}.`)
        break
      case 'raindrops':
        lines.push(`Raindrop punch: r ${op.radius}, spacing ${op.spacing}.`)
        break
      case 'wfolds':
        lines.push(`W-pattern: ${op.folds} folds.`)
        break
      case 'fold':
        lines.push(`Fold billet ${op.times}× (approx doubles layer count each fold).`)
        break
      case 'stretch':
        lines.push(`Draw out ×${op.factor}.`)
        break
    }
  })
  return lines
}

// ===================== 3D Billet Pane — No external libs =====================
function BilletPane({ patternCanvas }: { patternCanvas: HTMLCanvasElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const angleRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, w, h)

      // Animate angle
      angleRef.current += 0.01
      const a = angleRef.current

      // Billet dimensions in screen space
      const cx = w * 0.5
      const cy = h * 0.6
      const length = w * 0.6
      const thickness = h * 0.12
      const depth = h * 0.18

      const skew = Math.sin(a) * 0.5 + 0.5 // 0..1
      const topOffset = depth * (0.3 + 0.7 * skew)

      // Front face quad
      const x0 = cx - length / 2
      const x1 = cx + length / 2
      const y0 = cy - thickness / 2
      const y1 = cy + thickness / 2

      // Top face quad (towards -y)
      const tx0 = x0 + topOffset * 0.6
      const tx1 = x1 + topOffset * 0.6
      const ty0 = y0 - topOffset

      // Shadow
      const shadowOffset = depth * 0.6
      ctx.save()
      ctx.translate(0, shadowOffset)
      ctx.globalAlpha = 0.2
      ctx.fillStyle = 'black'
      ctx.beginPath()
      ctx.moveTo(tx0, ty0)
      ctx.lineTo(tx1, ty0)
      ctx.lineTo(x1, y1)
      ctx.lineTo(x0, y1)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      // Top face gradient
      const topGrad = ctx.createLinearGradient(tx0, ty0, x0, y0)
      topGrad.addColorStop(0, '#333')
      topGrad.addColorStop(1, '#222')
      ctx.fillStyle = topGrad
      ctx.beginPath()
      ctx.moveTo(tx0, ty0)
      ctx.lineTo(tx1, ty0)
      ctx.lineTo(x1, y0)
      ctx.lineTo(x0, y0)
      ctx.closePath()
      ctx.fill()

      // Front face textured via slice-based mapping
      if (patternCanvas) {
        const slices = 120
        for (let i = 0; i < slices; i++) {
          const t0 = i / slices
          const t1 = (i + 1) / slices
          const sy = Math.floor(t0 * patternCanvas.height)
          const sh = Math.max(1, Math.floor(patternCanvas.height / slices))

          const yTop = y0
          const yBot = y1
          const xLeftTop = x0
          const xRightTop = x1
          const xLeftBot = x0
          const xRightBot = x1

          const xL = xLeftTop + (xLeftBot - xLeftTop) * t0
          const xR = xRightTop + (xRightBot - xRightTop) * t0
          const y = yTop + (yBot - yTop) * t0
          const nextXL = xLeftTop + (xLeftBot - xLeftTop) * t1
          const nextXR = xRightTop + (xRightBot - xRightTop) * t1
          const nextY = yTop + (yBot - yTop) * t1

          const dwTop = xR - xL
          const dwBot = nextXR - nextXL
          const dw = (dwTop + dwBot) * 0.5
          const dh = nextY - y

          ctx.save()
          ctx.beginPath()
          ctx.moveTo(xL, y)
          ctx.lineTo(xR, y)
          ctx.lineTo(nextXR, nextY)
          ctx.lineTo(nextXL, nextY)
          ctx.closePath()
          ctx.clip()

          ctx.drawImage(
            patternCanvas,
            0,
            sy,
            patternCanvas.width,
            sh,
            xL,
            y,
            dw,
            Math.max(1, dh)
          )
          ctx.restore()
        }
      } else {
        ctx.fillStyle = '#444'
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      }

      // Edge strokes
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 2
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)

      rafRef.current = requestAnimationFrame(draw)
    }

    const onResize = () => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    }

    onResize()
    rafRef.current = requestAnimationFrame(draw)
    window.addEventListener('resize', onResize)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [patternCanvas])

  return <canvas ref={canvasRef} className="h-full w-full max-w-[1200px] mx-auto rounded-xl bg-neutral-900" />
}

// ===================== Knife Preview Pane — No external libs =====================
function KnifePane({ patternCanvas, uOffset }: { patternCanvas: HTMLCanvasElement | null, uOffset: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, w, h)

      // Blade geometry params (tweakable)
      const margin = 36
      const bladeL = w - margin * 2
      const spineYBase = h * 0.44
      const edgeY = h * 0.72
      const clipLen = bladeL * 0.2 // clip point
      const belly = 0.08 // subtle belly curve factor

      const x0 = margin // heel
      const x1 = margin + bladeL // tip end
      const clipStart = x1 - clipLen

      // Build outline path
      const spineYAt = (x: number) => {
        const clipRaise = x > clipStart ? (x - clipStart) / (x1 - clipStart) : 0
        return spineYBase - clipRaise * 28 // raise near tip
      }
      const edgeYAt = (x: number) => {
        const t = (x - x0) / (x1 - x0)
        // belly curve down mid-blade
        return edgeY - Math.sin(t * Math.PI) * belly * (edgeY - spineYBase)
      }

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x0, spineYAt(x0))
      ctx.lineTo(clipStart, spineYAt(clipStart))
      ctx.lineTo(x1, (spineYAt(x1) + edgeYAt(x1)) / 2)
      ctx.lineTo(clipStart, edgeYAt(clipStart))
      ctx.lineTo(x0, edgeYAt(x0))
      ctx.closePath()
      ctx.clip()

      if (patternCanvas) {
        const slices = 320
        for (let i = 0; i < slices; i++) {
          const t0 = i / slices
          const t1 = (i + 1) / slices
          const sx0 = x0 + (x1 - x0) * t0
          const sx1 = x0 + (x1 - x0) * t1

          const yTop0 = spineYAt(sx0)
          const yTop1 = spineYAt(sx1)
          const yBot0 = edgeYAt(sx0)
          const yBot1 = edgeYAt(sx1)

          // source: take a vertical slice along *length* of the pattern
          const srcX = Math.floor((((uOffset ?? 0) + t0) % 1) * patternCanvas.width)
          const srcW = Math.max(1, Math.floor(patternCanvas.width / slices))

          ctx.save()
          ctx.beginPath()
          ctx.moveTo(sx0, yTop0)
          ctx.lineTo(sx1, yTop1)
          ctx.lineTo(sx1, yBot1)
          ctx.lineTo(sx0, yBot0)
          ctx.closePath()
          ctx.clip()

          // draw pattern slice stretched into the trapezoid
          const minY = Math.min(yTop0, yTop1)
          const maxY = Math.max(yBot0, yBot1)
          const dw = Math.max(1, sx1 - sx0)
          const dh = Math.max(1, maxY - minY)
          ctx.drawImage(patternCanvas, srcX, 0, srcW, patternCanvas.height, sx0, minY, dw, dh)

          // bevel shading: darker toward edge, subtle spine highlight
          const grad = ctx.createLinearGradient(sx0, yTop0, sx0, yBot0)
          grad.addColorStop(0, 'rgba(255,255,255,0.06)')
          grad.addColorStop(1, 'rgba(0,0,0,0.35)')
          ctx.globalCompositeOperation = 'multiply'
          ctx.fillStyle = grad
          ctx.fillRect(sx0, minY, dw, dh)
          ctx.globalCompositeOperation = 'source-over'

          ctx.restore()
        }
      }

      ctx.restore()

      // Outline stroke
      ctx.strokeStyle = '#121212'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x0, spineYAt(x0))
      ctx.lineTo(clipStart, spineYAt(clipStart))
      ctx.lineTo(x1, (spineYAt(x1) + edgeYAt(x1)) / 2)
      ctx.lineTo(clipStart, edgeYAt(clipStart))
      ctx.lineTo(x0, edgeYAt(x0))
      ctx.closePath()
      ctx.stroke()

      rafRef.current = requestAnimationFrame(draw)
    }

    const onResize = () => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    }

    onResize()
    rafRef.current = requestAnimationFrame(draw)
    window.addEventListener('resize', onResize)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [patternCanvas, uOffset])

  return <canvas ref={canvasRef} className="h-full w-full max-w-[1200px] mx-auto rounded-xl bg-neutral-900" />
}

// ===================== Knob (no external libs) =====================
function Knob({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit = '',
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  unit?: string
}) {
  const size = 72
  const radius = 28
  const [dragging, setDragging] = useState(false)

  const angleFromValue = (v: number) => {
    const t = (v - min) / (max - min)
    return -140 + t * 280 // clamp arc -140..+140
  }
  const valueFromAngle = (a: number) => {
    const t = (a + 140) / 280
    const raw = min + t * (max - min)
    const snapped = Math.round(raw / step) * step
    return Math.min(max, Math.max(min, snapped))
  }

  const onPointer = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLDivElement
    const rect = target.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI // -180..180
    ang = Math.max(-140, Math.min(140, ang))
    onChange(valueFromAngle(ang))
  }

  return (
    <div
      className="select-none grid place-items-center w-[90px]"
      onPointerDown={(e) => {
        setDragging(true)
        ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
        onPointer(e)
      }}
      onPointerMove={(e) => dragging && onPointer(e)}
      onPointerUp={(e) => {
        setDragging(false)
        ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
      }}
    >
      <svg width={size} height={size} viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={radius + 6} fill="#1f1f1f" stroke="#2a2a2a" />
        {/* arc ticks */}
        {[...Array(9)].map((_, i) => {
          const a = -140 + (i * 280) / 8
          const x1 = 36 + Math.cos((a * Math.PI) / 180) * (radius + 2)
          const y1 = 36 + Math.sin((a * Math.PI) / 180) * (radius + 2)
          const x2 = 36 + Math.cos((a * Math.PI) / 180) * (radius + 8)
          const y2 = 36 + Math.sin((a * Math.PI) / 180) * (radius + 8)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#444" strokeWidth={2} />
        })}
        {/* needle */}
        {(() => {
          const a = angleFromValue(value)
          const x = 36 + Math.cos((a * Math.PI) / 180) * radius
          const y = 36 + Math.sin((a * Math.PI) / 180) * radius
          return <line x1="36" y1="36" x2={x} y2={y} stroke="#bbb" strokeWidth={3} strokeLinecap="round" />
        })()}
        <circle cx="36" cy="36" r="14" fill="#2a2a2a" stroke="#3a3a3a" />
      </svg>
      <div className="text-center text-xs mt-1">
        <div className="text-neutral-400">{label}</div>
        <div className="font-semibold">{value}{unit}</div>
      </div>
    </div>
  )
}

// ===================== Materials (Steel) Picker =====================
function MaterialPalette({ onAddSheets }: { onAddSheets: (m: MaterialType, count: number) => void }) {
  const [selectedMat, setSelectedMat] = useState<MaterialType>('1084')
  const [count, setCount] = useState(5)
  const all = Object.keys(MATERIAL_CATALOG) as MaterialType[]

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex flex-wrap items-center gap-2 bg-neutral-800 rounded-lg px-2 py-1">
        <label className="text-xs text-neutral-400">Steel</label>
        <select
          className="bg-neutral-800 outline-none min-w-[120px]"
          value={selectedMat}
          onChange={(e) => setSelectedMat(e.target.value as MaterialType)}
        >
          {all.map((m) => (
            <option key={m} value={m}>
              {MATERIAL_CATALOG[m].name}
            </option>
          ))}
        </select>
        <label className="text-xs text-neutral-400 ml-2">Count</label>
        <input
          type="number"
          min={1}
          max={500}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value))))}
          className="w-16 bg-neutral-700 rounded px-2 py-1"
        />
        <div className="flex flex-wrap gap-1 ml-1">
          <button className="px-2 py-1 rounded bg-neutral-700" onClick={() => onAddSheets(selectedMat, 1)}>
            +1
          </button>
          <button className="px-2 py-1 rounded bg-neutral-700" onClick={() => onAddSheets(selectedMat, 5)}>
            +5
          </button>
          <button className="px-2 py-1 rounded bg-neutral-700" onClick={() => onAddSheets(selectedMat, 10)}>
            +10
          </button>
          <button className="px-2 py-1 rounded bg-neutral-700" onClick={() => onAddSheets(selectedMat, count)}>
            Add ×{count}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===================== Operation Bubble (fully wired) =====================
type BubbleProps = {
  initial: Operation
  anchor: { x: number; y: number } // screen coords from the clicked button
  onConfirm: (op: Operation) => void
  onClose: () => void
}

function OperationBubble({ initial, anchor, onConfirm, onClose }: BubbleProps) {
  const [op, setOp] = useState<Operation>(initial)
  const boxRef = useRef<HTMLDivElement>(null)

  // Close on outside click + hotkeys
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') onConfirm(op)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [op, onClose, onConfirm])

  // Position near anchor; keep on-screen margins
  const margin = 12
  const width = 340
  const height = 300
  const left = Math.max(margin, Math.min(anchor.x - width / 2, window.innerWidth - width - margin))
  const top = Math.max(margin, Math.min(anchor.y + 12, window.innerHeight - height - margin))

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="text-xs uppercase tracking-wide text-neutral-400">{children}</div>
  )
  const Row = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-3">{children}</div>
  )
  const Num = ({ value, onChange, min, max, step = 1 }: {
    value: number; onChange: (v: number) => void; min: number; max: number; step?: number
  }) => (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => onChange(Number(e.target.value))}
      className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
    />
  )
  const Slider = ({ value, onChange, min, max, step = 0.01 }: {
    value: number; onChange: (v: number) => void; min: number; max: number; step?: number
  }) => (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full"
    />
  )
  const Preset = ({ label, apply }: { label: string; apply: () => void }) => (
    <button
      className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs"
      onClick={apply}
    >
      {label}
    </button>
  )

  const title =
    op.kind === 'twist' ? 'Twist' :
    op.kind === 'ladder' ? 'Ladder' :
    op.kind === 'raindrops' ? 'Raindrops' :
    op.kind === 'wfolds' ? 'W-Folds' :
    op.kind === 'fold' ? 'Fold' :
    op.kind === 'stretch' ? 'Stretch' : 'Operation'

  const previewLine = (() => {
    switch (op.kind) {
      case 'twist': return `Twist billet ~${op.turns.toFixed(2)} turn(s) (${Math.round(op.turns * 360)}°).`
      case 'ladder': return `Ladder grind — spacing ${op.spacing.toFixed(2)}, depth ${op.depth.toFixed(2)}.`
      case 'raindrops': return `Raindrop — radius ${op.radius.toFixed(3)}, spacing ${op.spacing.toFixed(3)}.`
      case 'wfolds': return `W-pattern seed — ${op.folds} folds.`
      case 'fold': return `Fold billet ×${op.times} (≈ ×${Math.pow(2, Math.max(0, Math.floor(op.times)))} layers).`
      case 'stretch': return `Draw out ×${op.factor.toFixed(2)} (compresses pattern along length).`
      default: return ''
    }
  })()

  return (
    <div
      ref={boxRef}
      className="fixed z-[999] rounded-2xl shadow-2xl border border-neutral-800 bg-neutral-900/95 backdrop-blur p-3 w-[340px]"
      style={{ left, top, height }}
      role="dialog"
      aria-label={`${title} options`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{title}</div>
        <button onClick={onClose} aria-label="Close"
          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">✕</button>
      </div>

      {/* Content per operation */}
      <div className="space-y-3 text-sm">
        {op.kind === 'twist' && (
          <>
            <Label>Degrees</Label>
            <Row>
              <Knob
                label="Twist"
                value={Math.round(op.turns * 360)}
                min={0} max={720} step={10} unit="°"
                onChange={(deg) => setOp({ ...op, turns: Math.max(0, Math.min(2, deg / 360)) })}
              />
              <div className="flex-1">
                <Slider min={0} max={720} step={1}
                  value={Math.round(op.turns * 360)}
                  onChange={(deg) => setOp({ ...op, turns: Math.max(0, Math.min(2, Number(deg) / 360)) })}
                />
                <div className="mt-2">
                  <Num min={0} max={720} step={10}
                    value={Math.round(op.turns * 360)}
                    onChange={(deg) => setOp({ ...op, turns: Math.max(0, Math.min(2, deg / 360)) })}
                  /> <span className="ml-1 text-neutral-400">({op.turns.toFixed(2)} turns)</span>
                </div>
              </div>
            </Row>
            <div className="flex gap-2 flex-wrap">
              <Preset label="¼ turn" apply={() => setOp({ ...op, turns: 0.25 })} />
              <Preset label="½ turn" apply={() => setOp({ ...op, turns: 0.5 })} />
              <Preset label="1 turn" apply={() => setOp({ ...op, turns: 1 })} />
              <Preset label="2 turns" apply={() => setOp({ ...op, turns: 2 })} />
            </div>
          </>
        )}

        {op.kind === 'ladder' && (
          <>
            <Label>Spacing</Label>
            <Row>
              <Slider min={0.02} max={0.3} step={0.01} value={op.spacing}
                onChange={(v) => setOp({ ...op, spacing: v as number })} />
              <Num min={0.02} max={0.3} step={0.01} value={op.spacing}
                onChange={(v) => setOp({ ...op, spacing: v })} />
            </Row>
            <Label>Depth</Label>
            <Row>
              <Slider min={0} max={1} step={0.01} value={op.depth}
                onChange={(v) => setOp({ ...op, depth: v as number })} />
              <Num min={0} max={1} step={0.01} value={op.depth}
                onChange={(v) => setOp({ ...op, depth: v })} />
            </Row>
            <div className="flex gap-2 flex-wrap">
              <Preset label="Tight/Shallow" apply={() => setOp({ ...op, spacing: 0.06, depth: 0.25 })} />
              <Preset label="Medium" apply={() => setOp({ ...op, spacing: 0.10, depth: 0.5 })} />
              <Preset label="Wide/Deep" apply={() => setOp({ ...op, spacing: 0.18, depth: 0.8 })} />
            </div>
          </>
        )}

        {op.kind === 'raindrops' && (
          <>
            <Label>Radius</Label>
            <Row>
              <Slider min={0.01} max={0.2} step={0.005} value={op.radius}
                onChange={(v) => setOp({ ...op, radius: v as number })} />
              <Num min={0.01} max={0.2} step={0.005} value={op.radius}
                onChange={(v) => setOp({ ...op, radius: v })} />
            </Row>
            <Label>Spacing</Label>
            <Row>
              <Slider min={0.05} max={0.3} step={0.005} value={op.spacing}
                onChange={(v) => setOp({ ...op, spacing: v as number })} />
              <Num min={0.05} max={0.3} step={0.005} value={op.spacing}
                onChange={(v) => setOp({ ...op, spacing: v })} />
            </Row>
            <div className="flex gap-2 flex-wrap">
              <Preset label="Fine" apply={() => setOp({ ...op, radius: 0.03, spacing: 0.10 })} />
              <Preset label="Medium" apply={() => setOp({ ...op, radius: 0.06, spacing: 0.14 })} />
              <Preset label="Bold" apply={() => setOp({ ...op, radius: 0.10, spacing: 0.18 })} />
            </div>
          </>
        )}

        {op.kind === 'wfolds' && (
          <>
            <Label>Folds</Label>
            <Row>
              <Slider min={2} max={12} step={1} value={op.folds}
                onChange={(v) => setOp({ ...op, folds: v as number })} />
              <Num min={2} max={12} step={1} value={op.folds}
                onChange={(v) => setOp({ ...op, folds: v })} />
            </Row>
            <div className="flex gap-2 flex-wrap">
              <Preset label="Seed (6)" apply={() => setOp({ ...op, folds: 6 })} />
              <Preset label="Bold (8)" apply={() => setOp({ ...op, folds: 8 })} />
              <Preset label="Fine (10)" apply={() => setOp({ ...op, folds: 10 })} />
            </div>
          </>
        )}

        {op.kind === 'fold' && (
          <>
            <Label>Times</Label>
            <Row>
              <Slider min={1} max={5} step={1} value={op.times}
                onChange={(v) => setOp({ ...op, times: v as number })} />
              <Num min={1} max={5} step={1} value={op.times}
                onChange={(v) => setOp({ ...op, times: v })} />
            </Row>
            <div className="flex gap-2 flex-wrap">
              <Preset label="×1 (2× layers)" apply={() => setOp({ ...op, times: 1 })} />
              <Preset label="×2 (4×)" apply={() => setOp({ ...op, times: 2 })} />
              <Preset label="×3 (8×)" apply={() => setOp({ ...op, times: 3 })} />
            </div>
          </>
        )}

        {op.kind === 'stretch' && (
          <>
            <Label>Factor</Label>
            <Row>
              <Slider min={0.5} max={4} step={0.01} value={op.factor}
                onChange={(v) => setOp({ ...op, factor: v as number })} />
              <Num min={0.5} max={4} step={0.01} value={op.factor}
                onChange={(v) => setOp({ ...op, factor: v })} />
            </Row>
            <div className="flex gap-2 flex-wrap">
              <Preset label="Short ×0.8" apply={() => setOp({ ...op, factor: 0.8 })} />
              <Preset label="Normal ×1.0" apply={() => setOp({ ...op, factor: 1.0 })} />
              <Preset label="Drawn ×2.0" apply={() => setOp({ ...op, factor: 2.0 })} />
            </div>
          </>
        )}

        {/* Live sentence preview */}
        <div className="mt-1 p-2 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
          {previewLine}
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">
          Cancel
        </button>
        <button
          onClick={() => onConfirm(op)}
          className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600"
        >
          Add step
        </button>
      </div>

      {/* Arrow */}
      <div
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-neutral-900 border-l border-t border-neutral-800"
      />
    </div>
  )
}

// ===================== App =====================
export default function DamascusPlayground() {
  const [layers, setLayers] = useState<MaterialType[]>([])
  const [ops, setOps] = useState<Operation[]>([])
  const [view, setView] = useState<'billet' | 'knife'>('billet')

  // Undo/Redo history
  type State = { layers: MaterialType[]; ops: Operation[] }
  const [past, setPast] = useState<State[]>([])
  const [future, setFuture] = useState<State[]>([])
  const snapshot = (l = layers, o = ops) => ({ layers: [...l], ops: [...o] })
  const commit = (nl: MaterialType[] | null, no: Operation[] | null) => {
    const next = { layers: nl ? [...nl] : layers, ops: no ? [...no] : ops }
    setPast((p) => [...p, snapshot()])
    if (nl) setLayers(next.layers)
    if (no) setOps(next.ops)
    setFuture([])
  }
  const undo = () => {
    setPast((p) => {
      if (p.length === 0) return p
      const prev = p[p.length - 1]
      setFuture((f) => [snapshot(), ...f])
      setLayers(prev.layers)
      setOps(prev.ops)
      return p.slice(0, -1)
    })
  }
  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f
      const nxt = f[0]
      setPast((p) => [...p, snapshot()])
      setLayers(nxt.layers)
      setOps(nxt.ops)
      return f.slice(1)
    })
  }

  const patternCanvas = useMemo(() => {
    if (typeof document === 'undefined') return null as any
    if (layers.length === 0) return null as any // blank when no layers
    return generatePattern(layers, ops, 1024, 512)
  }, [layers, ops])

  const pushOp = (op: Operation) => commit(null, [...ops, op])
  const addSheets = (mat: MaterialType, count: number) => {
    const nl = [...layers, ...Array(count).fill(mat)]
    const no: Operation[] = [...ops, { kind: 'addSheets', material: mat, count }]
    commit(nl, no)
  }

  const quickBase = (pairs = 5) => {
    const base: MaterialType[] = []
    for (let i = 0; i < pairs; i++) base.push('1084', '15N20')
    commit(base, [])
  }

  const moveOp = (idx: number, dir: -1 | 1) => {
    const next = ops.slice()
    const ni = idx + dir
    if (ni < 0 || ni >= next.length) return
    const tmp = next[idx]
    next[idx] = next[ni]
    next[ni] = tmp
    commit(null, next)
  }

  const updateOp = (index: number, patch: Partial<Operation>) => {
    const next = ops.map((op, i) => (i === index ? ({ ...op, ...patch } as Operation) : op))
    commit(null, next)
  }
  const removeOp = (idx: number) => commit(null, ops.filter((_, i) => i !== idx))

  const exportTxt = () => {
    const blob = new Blob([instructionsFromOps(ops).join('\n')], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'damascus_instructions.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveRecipe = () => {
    const data = JSON.stringify({ layers, ops }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pattern_recipe.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadRecipe = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result))
        if (Array.isArray(obj.layers) && Array.isArray(obj.ops)) {
          setLayers(obj.layers)
          setOps(obj.ops)
          setPast([])
          setFuture([])
        }
      } catch {}
    }
    reader.readAsText(file)
  }

  // ========== Developer smoke tests (browser only) ==========
  if (typeof window !== 'undefined') {
    try {
      const c = generatePattern(['1084', '15N20'], [{ kind: 'twist', turns: 1 }], 64, 32)
      console.assert(c.width === 64 && c.height === 32, 'Pattern dimensions should match')
    } catch (e) {
      console.error(e)
    }
    try {
      const txt = instructionsFromOps([
        { kind: 'addSheets', material: '1084', count: 3 },
        { kind: 'stretch', factor: 2 },
      ])
      console.assert(txt[0].includes('Stack 3') && txt[1].includes('×2'), 'Instruction text content')
    } catch (e) {
      console.error(e)
    }
    try {
      const none = instructionsFromOps([])
      console.assert(Array.isArray(none) && none.length === 0, 'Empty ops -> empty instructions')
    } catch (e) {
      console.error(e)
    }
    try {
      const c2 = generatePattern(
        ['1084', '15N20'],
        [{ kind: 'raindrops', radius: 0.05, spacing: 0.1 }],
        32,
        16
      )
      console.assert(c2.width === 32 && c2.height === 16, 'Small pattern dimensions should match')
    } catch (e) {
      console.error(e)
    }
    // Additional tests
    try {
      const tFold = instructionsFromOps([{ kind: 'fold', times: 2 } as any])
      console.assert(tFold[0].toLowerCase().includes('fold billet 2×'), 'Fold instruction text')
    } catch (e) {
      console.error(e)
    }
    try {
      const c3 = generatePattern([], [], 16, 8)
      console.assert(c3.width === 16 && c3.height === 8, 'Empty layers canvas dims')
    } catch (e) {
      console.error(e)
    }
  }

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = e.key.toLowerCase() === 'z'
      if ((e.ctrlKey || e.metaKey) && z) {
        e.shiftKey ? redo() : undo()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Shareable URL for recipes
  const encode = (obj: any) => encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(obj)))))
  const decode = (s: string) => JSON.parse(decodeURIComponent(escape(atob(s))))

  useEffect(() => {
    const qp = new URLSearchParams(location.search).get('recipe')
    if (!qp) return
    try {
      const obj = decode(qp)
      if (Array.isArray(obj.layers) && Array.isArray(obj.ops)) {
        setLayers(obj.layers)
        setOps(obj.ops)
        setPast([])
        setFuture([])
      }
    } catch {}
  }, [])

  const copyShareURL = async () => {
    const url = `${location.origin}${location.pathname}?recipe=${encode({ layers, ops })}`
    await navigator.clipboard.writeText(url)
    alert('Share link copied!')
  }

  // Estimated layer count after folds
  const estLayers = useMemo(() => {
    let n = layers.length
    for (const op of ops) if (op.kind === 'fold') n *= Math.pow(2, Math.max(0, Math.floor(op.times)))
    return n
  }, [layers, ops])

  // Throttle heavy updates
  const frameRef = useRef<number | null>(null)
  const updateOpSmooth = (index: number, patch: Partial<Operation>) => {
    const next = ops.map((op, i) => (i === index ? ({ ...op, ...patch } as Operation) : op))
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      commit(null, next)
    })
  }

  // Adding MailButton component for robust mailto + Gmail fallback
  function MailButton({
    to = "gforbusines@gmail.com",
    subject = "Damascus Pattern feedback",
    body = "",
    children = "💬 Feedback",
    className = "",
  }: {
    to?: string
    subject?: string
    body?: string
    children?: React.ReactNode
    className?: string
  }) {
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault()
      const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      // Try native handler first
      window.location.href = mailto

      // If the page is still visible after a short delay, assume no mail client
      const timer = setTimeout(() => {
        if (document.visibilityState === "visible") {
          const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
          window.open(gmail, "_blank", "noopener,noreferrer")
        }
      }, 800)

      // Clean up if the tab actually gets hidden (user’s mail client took over)
      const onVis = () => {
        if (document.visibilityState !== "visible") {
          clearTimeout(timer)
          document.removeEventListener("visibilitychange", onVis)
        }
      }
      document.addEventListener("visibilitychange", onVis, { once: true })
    }

    return (
      <a href={`mailto:${to}`} onClick={handleClick} className={className} title="Send feedback">
        {children}
      </a>
    )
  }

  const [bubble, setBubble] = useState<{
    op: Operation | null
    anchor: { x: number; y: number } | null
  } | null>(null)

  const openBubble = (op: Operation, ev: React.MouseEvent<HTMLButtonElement>) => {
    const r = (ev.currentTarget as HTMLButtonElement).getBoundingClientRect()
    setBubble({ op, anchor: { x: r.left + r.width / 2, y: r.bottom + window.scrollY } })
  }

  const confirmBubble = (op: Operation) => {
    pushOp(op)
    setBubble(null)
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header component */}
      <header className="flex items-center justify-between px-6 py-4 bg-neutral-900 border-b border-neutral-800 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* Clickable logo (scrolls to top) */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            title="Go to top"
          >
            <img
              src="/public/blacksmith_logo.png"
              alt="Forge Logo"
              width={48}
              height={48}
              className="rounded-lg hover:opacity-80 transition"
            />
          </button>
          <h1
            className="text-2xl font-serif font-semibold tracking-tight"
            style={{
              textShadow: '0 0 8px rgba(175, 166, 154, 0.6), 0 0 16px rgba(255, 69, 0, 0.4)',
              color: '#ffffffff',
            }}
          >
            Damascus Pattern Playground
          </h1>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <MailButton className="text-neutral-300 hover:text-amber-400">
            💬 Feedback
          </MailButton>
        </nav>
      </header>

      <div className="max-w-screen-2xl mx-auto p-6 space-y-6">
        {/* TOP controls */}
        <section className="space-y-4">
          {/* Steel Stack card */}
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
            <h2 className="text-xl font-semibold mb-3">Steel Stack</h2>
            <MaterialPalette onAddSheets={addSheets} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="px-3 py-2 rounded-lg bg-amber-700" onClick={() => quickBase(5)}>
                Quick base (5 pairs)
              </button>
              <button className="px-3 py-2 rounded-lg bg-red-700" onClick={() => commit([], [])}>
                Clear All
              </button>
            </div>
            <div className="text-sm text-neutral-400 mt-2">Layers: {layers.length}</div>
            {layers.length > 0 && (
              <div className="mt-2">
                <LayerStrip layers={layers} />
              </div>
            )}
          </div>

          {/* Modifiers card */}
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
            <h2 className="text-xl font-semibold mb-3">Modifiers</h2>
            <div className="flex flex-wrap gap-3 items-center mb-3">
              <button
                className="px-3 py-2 rounded-lg bg-neutral-700"
                onClick={(e) => openBubble({ kind: 'ladder', spacing: 0.08, depth: 0.6 }, e)}
              >
                Ladder
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-neutral-700"
                onClick={(e) => openBubble({ kind: 'raindrops', radius: 0.07, spacing: 0.12 }, e)}
              >
                Raindrops
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-neutral-700"
                onClick={(e) => openBubble({ kind: 'wfolds', folds: 6 }, e)}
              >
                W-Folds
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-neutral-700"
                onClick={(e) => openBubble({ kind: 'fold', times: 1 }, e)}
              >
                Fold
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-neutral-700"
                onClick={(e) => openBubble({ kind: 'twist', turns: 1 }, e)}
              >
                Twist
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-neutral-700"
                onClick={(e) => openBubble({ kind: 'stretch', factor: 1.8 }, e)}
              >
                Stretch
              </button>
              <div className="ml-auto flex flex-wrap gap-2">
                <button className="px-3 py-2 rounded-lg bg-neutral-700 disabled:opacity-40" onClick={undo} disabled={past.length === 0}>
                  Undo
                </button>
                <button className="px-3 py-2 rounded-lg bg-neutral-700 disabled:opacity-40" onClick={redo} disabled={future.length === 0}>
                  Redo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* MAIN previews */}
        <section className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
            <h2 className="text-xl font-semibold mb-3">Billet/Knife switch</h2>
            <div className="flex gap-2">
              <button
                className={`px-3 py-2 rounded-lg ${view === 'billet' ? 'bg-neutral-700' : 'bg-neutral-800'}`}
                onClick={() => setView('billet')}
              >
                Billet
              </button>
              <button
                className={`px-3 py-2 rounded-lg ${view === 'knife' ? 'bg-neutral-700' : 'bg-neutral-800'}`}
                onClick={() => setView('knife')}
              >
                Knife
              </button>
            </div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-2 rounded-2xl">
            <div className="h-[420px] w-full rounded-xl overflow-hidden flex justify-center">
              {view === 'billet' ? (
                <BilletPane patternCanvas={layers.length ? patternCanvas : null} />
              ) : (
                <KnifePane patternCanvas={layers.length ? patternCanvas : null} uOffset={0} />
              )}
            </div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
            <h3 className="text-lg font-semibold mb-2">Pattern Preview (Etch)</h3>
            <div className="flex flex-col gap-6 items-center">
              {layers.length ? (
                <img
                  src={patternCanvas ? patternCanvas.toDataURL() : undefined}
                  className="w-full max-w-[960px] rounded-xl border border-neutral-800 transition-opacity duration-300 mx-auto"
                  style={{ opacity: patternCanvas ? 1 : 0 }}
                  alt="Pattern preview"
                />
              ) : (
                <div className="w-full max-w-[560px] h-[220px] grid place-items-center rounded-xl border border-dashed border-neutral-700 text-neutral-500">
                  No pattern yet — add layers to begin.
                </div>
              )}
              <div className="text-sm text-neutral-300 space-y-2 min-w-[220px]">
                <div>
                  <div className="font-semibold">Layers</div>
                  <div className="text-neutral-400">{layers.length} total</div>
                </div>
                <div>
                  <div className="font-semibold">Steps</div>
                  <ol className="list-decimal list-inside text-neutral-400 max-h-48 overflow-auto pr-2">
                    {instructionsFromOps(ops).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </div>
                <button className="px-3 py-2 rounded-lg bg-neutral-600 w-full" onClick={exportTxt}>
                  Save instructions
                </button>
              </div>
            </div>
          </div>
          <div className="w-full max-w-[680px] mx-auto bg-neutral-900 rounded-xl">
            <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
              <h2 className="text-xl font-semibold mb-3">Save / Load / Print</h2>
              <div className="flex flex-wrap gap-2 justify-center">
                <button className="px-3 py-2 rounded-lg bg-neutral-700" onClick={saveRecipe}>
                  Save Recipe
                </button>
                <label className="px-3 py-2 rounded-lg bg-neutral-700 cursor-pointer">
                  Load Recipe
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => e.target.files && loadRecipe(e.target.files[0])}
                  />
                </label>
                <button
                  className="px-3 py-2 rounded-lg bg-neutral-700"
                  onClick={() => {
                    const data = JSON.stringify({ layers, ops }, null, 2)
                    const blob = new Blob([data], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'damascus_pattern.json'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Export Instructions
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Ad slot card */}
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl min-h-[200px]">
          <div className="text-sm text-neutral-400">Advertisement:</div>
        </div>
      </div>

      {/* Footer component */}
      <footer className="text-center text-xs text-neutral-400 py-8 border-t border-neutral-800 bg-neutral-900 mt-8">
        <div className="space-y-1 mb-3">
          <div>Made with passion for blacksmiths worldwide!</div>
          <div>Created by Gerrit Johansen for blacksmiths</div>
          <div>Damascus Pattern Generator © 2025</div>
        </div>

        <div className="mb-3">
          <MailButton className="hover:text-amber-400">
            Feedback: gforbusines@gmail.com
          </MailButton>
        </div>

        <div className="mb-4">
          <a
            href="https://buymeacoffee.com/gerritjohansen"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-700 text-amber-300"
          >
            Buy me a coffee:) (for the forge!) ☕
          </a>
        </div>

        <div className="text-neutral-500">
          *Visuals are an approximation for planning. Real results vary with heat, reduction ratios, and technique.
        </div>
      </footer>

      {/* Render OperationBubble */}
      {bubble?.op && bubble.anchor && (
        <OperationBubble
          initial={bubble.op}
          anchor={bubble.anchor}
          onConfirm={confirmBubble}
          onClose={() => setBubble(null)}
        />
      )}
    </div>
  )
}

// ===================== Layer Strip (for billet view) =====================
function LayerStrip({ layers }: { layers: MaterialType[] }) {
  return (
    <div className="h-3 w-full rounded overflow-hidden flex border border-neutral-800">
      {layers.map((m, i) => {
        const v = Math.round(MATERIALS[m].etch * 255)
        const c = `rgb(${v},${v},${v})`
        return <div key={i} style={{ width: `${100 / layers.length}%`, background: c }} />
      })}
    </div>
  )
}
