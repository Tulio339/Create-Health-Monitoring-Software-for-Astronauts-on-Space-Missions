// Formas do holograma do corpo: silhueta, contornos musculares e anatomia de cada região.
// Só desenho (SVG puro, feito à mão); a lógica de status, clique e animação fica em BodyFigure.tsx.
import { Fragment } from 'react'
import type { ReactElement, SVGProps } from 'react'
import type { BodyRegionId } from '../types'

export type BodyLayer = 'overview' | 'skeleton' | 'organs' | 'immune_nervous'
export type BodySide = 'front' | 'back'

interface ShapeStyle {
  /** Desenha também o espelho do outro lado do corpo. */
  sym?: boolean
  /** Fica no braço: a cópia espelhada acompanha a leve abertura do outro braço. */
  arm?: boolean
  /** Traço aberto, sem preenchimento. */
  open?: boolean
  /** Traço mais discreto (músculos, nervos, vasos). */
  soft?: boolean
  dash?: string
  w?: number
}
export type Shape = ShapeStyle &
  (
    | { t: 'path'; d: string }
    | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { t: 'circle'; cx: number; cy: number; r: number }
    | { t: 'rect'; x: number; y: number; width: number; height: number; rx: number }
  )

// Quadro de 260 × 560 com o corpo centrado em x = 130 e cerca de 7,5 cabeças de altura.
// De frente, o lado esquerdo do corpo fica à direita do desenho; de costas, tudo é espelhado
// (o coração passa para a esquerda).
export const CX = 130
export const MIRROR = `translate(${2 * CX} 0) scale(-1 1)`

// Pose: um dos braços fica um pouco mais aberto que o outro (giro em torno do ombro),
// para a figura não parecer rígida. Vale para o contorno e para o que está dentro do braço.
const ARM_TILT = -2.5
const ARM_PIVOT = [186, 110]
const MIRROR_ARM = `${MIRROR} rotate(${ARM_TILT} ${ARM_PIVOT.join(' ')})`

export function draw(shape: Shape, key: number, props: SVGProps<SVGElement>): ReactElement {
  const p = props as Record<string, unknown>
  let el: ReactElement
  switch (shape.t) {
    case 'path':
      el = <path d={shape.d} {...p} />
      break
    case 'ellipse':
      el = <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...p} />
      break
    case 'circle':
      el = <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...p} />
      break
    case 'rect':
      el = <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...p} />
      break
  }
  return (
    <Fragment key={key}>
      {el}
      {shape.sym && <g transform={shape.arm ? MIRROR_ARM : MIRROR}>{el}</g>}
    </Fragment>
  )
}

// --- Silhueta ------------------------------------------------------------------
// Metade direita do contorno, do topo da cabeça até a virilha (os dois extremos ficam no eixo
// central), toda em curvas cúbicas [x1, y1, x2, y2, x, y].
const HALF_START = [CX, 12]
const HALF: number[][] = [
  [143, 12, 154.5, 23, 154.5, 40], // crânio
  [154.5, 50, 153, 58, 151, 64], // têmpora e maçã do rosto
  [149, 71, 145, 76, 140.5, 79.5], // mandíbula
  [140.5, 84, 140.5, 89, 141.5, 93], // pescoço
  [147, 99, 160, 102.5, 174, 105.5], // trapézio
  [186, 107.5, 196, 113, 199, 126], // ombro
  [201, 138, 202, 152, 204, 166], // deltoide e bíceps
  [205.5, 182, 207, 198, 210, 212], // cotovelo
  [214, 224, 216.5, 240, 217, 256], // antebraço
  [218, 266, 218.5, 276, 219, 284], // punho
  [221, 292, 223, 304, 222, 316], // dorso da mão
  [221.5, 325, 219, 334, 215.5, 338], // dedos
  [213, 340.5, 210.5, 338, 210.5, 334],
  [210.5, 326, 211, 317, 210.5, 310], // vão entre os dedos e o polegar
  [210, 314, 208, 318.5, 205.5, 317], // polegar
  [203, 315.5, 203.5, 306, 205, 298],
  [206, 292, 207, 288, 207, 283], // punho, por dentro
  [206, 268, 203, 246, 199.5, 228], // antebraço, por dentro
  [197.5, 220, 196, 213, 195.5, 206], // cotovelo, por dentro
  [191, 188, 186, 164, 179, 143], // bíceps até a axila
  [180, 156, 175.5, 176, 170, 192], // peito e costelas
  [166, 203, 162.5, 210, 162.5, 219], // cintura
  [162.5, 232, 168, 246, 171, 262], // crista do quadril
  [173, 274, 174.5, 288, 174, 302], // quadril
  [173, 330, 167, 364, 161.5, 392], // coxa
  [160, 400, 160, 408, 161.5, 416], // joelho
  [165, 428, 166.5, 444, 164.5, 460], // panturrilha
  [162, 480, 155, 498, 153.5, 514], // tornozelo
  [153.5, 519, 156, 522, 158, 526], // maléolo
  [162, 531, 166, 536, 165.5, 539.5], // pé
  [165, 543, 152, 543.5, 143, 543], // dedos do pé
  [138.5, 542.8, 136.5, 540, 137, 535.5],
  [137.5, 529, 139.5, 523, 139.5, 516], // tornozelo, por dentro
  [139.5, 496, 135, 474, 135.5, 452], // panturrilha, por dentro
  [136, 436, 138.5, 424, 138.5, 412],
  [138.5, 404, 137.5, 398, 137.5, 390], // joelho, por dentro
  [137, 356, 134, 316, CX, 288], // coxa, por dentro, até a virilha
]
/** Segmentos do braço (do ombro à axila), que giram na metade espelhada. */
const ARM_SEGMENTS = [5, 19]

/** Contorno completo: a metade direita seguida do seu espelho (com o braço mais aberto), de volta. */
function buildSilhouette(): string {
  const rad = (ARM_TILT * Math.PI) / 180
  const [px, py] = ARM_PIVOT
  // Ponto do segmento `i`, levado para a metade espelhada.
  const m = (i: number, x: number, y: number): string => {
    if (i >= ARM_SEGMENTS[0] && i <= ARM_SEGMENTS[1]) {
      const dx = x - px
      const dy = y - py
      x = px + dx * Math.cos(rad) - dy * Math.sin(rad)
      y = py + dx * Math.sin(rad) + dy * Math.cos(rad)
    }
    return `${(2 * CX - x).toFixed(1)} ${y.toFixed(1)}`
  }
  let d = `M${HALF_START.join(' ')}`
  for (const s of HALF) d += ` C${s.join(' ')}`
  for (let i = HALF.length - 1; i >= 0; i--) {
    const s = HALF[i]
    const end = i === 0 ? m(-1, HALF_START[0], HALF_START[1]) : m(i - 1, HALF[i - 1][4], HALF[i - 1][5])
    d += ` C${m(i, s[2], s[3])} ${m(i, s[0], s[1])} ${end}`
  }
  return `${d} Z`
}
export const SILHOUETTE = buildSilhouette()
/** Linha do queixo: fecha o oval do rosto sobre o pescoço. */
export const CHIN = 'M140.5 79.5 C137 82.6 133.5 84 130 84 C126.5 84 123 82.6 119.5 79.5'

/** Contornos musculares discretos (decorativos), diferentes de frente e de costas. */
export const DECOR: Record<BodySide, Shape[]> = {
  front: [
    { t: 'path', d: 'M134 107 C146 104 160 105 173 108', open: true, sym: true }, // clavícula
    { t: 'path', d: 'M132 151 C144 158 165 156 174 138', open: true, sym: true }, // peitoral
    { t: 'path', d: 'M130 118 V150 M130 162 V262', open: true }, // linha média
    { t: 'path', d: 'M120 186 Q130 189 140 186 M120.5 204 Q130 207 139.5 204 M121 222 Q130 225 139 222', open: true },
    { t: 'path', d: 'M145 165 C148 192 147 232 138 264', open: true, sym: true }, // borda do abdômen
    { t: 'path', d: 'M166 312 C167 340 163 368 157 388', open: true, sym: true }, // quadríceps
    { t: 'path', d: 'M143 318 C142 350 144 374 147 388', open: true, sym: true },
    { t: 'path', d: 'M143 398 q6.5 5 13 0', open: true, sym: true }, // joelho
    { t: 'path', d: 'M162 424 C164 440 163 458 158 476', open: true, sym: true }, // panturrilha
    { t: 'path', d: 'M214.2 319 L213.6 335 M217.6 318 L217 331', open: true, sym: true, arm: true }, // dedos
  ],
  back: [
    { t: 'path', d: 'M130 96 V272', open: true }, // sulco da coluna
    { t: 'path', d: 'M141 122 C151 119 161 126 160 150 C152 148 144 140 141 122 Z', open: true, sym: true }, // escápula
    { t: 'path', d: 'M172 160 C162 190 148 210 134 222', open: true, sym: true }, // grande dorsal
    { t: 'path', d: 'M132 300 Q150 310 170 296', open: true, sym: true }, // glúteo
    { t: 'path', d: 'M142 400 q7 -3 14 0', open: true, sym: true },
    { t: 'path', d: 'M150 420 C151 440 151 458 149 474', open: true, sym: true }, // panturrilha
    { t: 'path', d: 'M214.2 319 L213.6 335 M217.6 318 L217 331', open: true, sym: true, arm: true }, // dedos
  ],
}

// --- Anatomia --------------------------------------------------------------------
// Coluna: vértebras que alargam do pescoço à lombar.
const VERTEBRAE: Shape[] = Array.from({ length: 17 }, (_, i): Shape => {
  const width = 6.5 + i * 0.36
  return { t: 'rect', x: CX - width / 2, y: 87 + i * 10.4, width, height: 7.6, rx: 2 }
})

// Caixa torácica: cada costela sai da coluna, contorna o tórax e volta pela frente —
// as cinco primeiras até o esterno, as demais até o arco costal.
const RIB_REACH = [150, 157, 161.5, 164, 165.5, 166, 165.5, 164, 161]
const RIB_ARCH = [
  [136.5, 172],
  [140.5, 180],
  [145, 189],
  [150, 198],
]
const RIBS: Shape[] = RIB_REACH.map((reach, i): Shape => {
  const y = 118 + i * 8.6
  const [fx, fy] = i < 5 ? [133.8, y + 9] : RIB_ARCH[i - 5]
  return {
    t: 'path',
    d: `M133.5 ${y.toFixed(1)} C${reach - 10} ${(y - 6).toFixed(1)} ${reach} ${(y - 1).toFixed(1)} ${reach} ${(y + 6).toFixed(1)} C${reach} ${(y + 12).toFixed(1)} ${fx + 9} ${fy + 3} ${fx} ${fy}`,
    open: true,
    sym: true,
    w: 1.5,
  }
})

export interface Anatomy {
  /** Desenho da região em qualquer camada em que ela apareça. */
  base: Shape[]
  /** Desenho extra na camada dedicada (esqueleto completo, nervos, vasos linfáticos). */
  detail?: Partial<Record<BodyLayer, Shape[]>>
  /** Área de clique invisível, do tamanho do desenho, para formas pequenas ou finas. */
  hit?: Shape[]
  /** Área de clique extra para o desenho da camada dedicada. */
  detailHit?: Partial<Record<BodyLayer, Shape[]>>
  /** Etiqueta na vista de frente: ponto apontado no órgão, altura e lado do texto. */
  callout: { x: number; y: number; labelY: number; side: 'left' | 'right' }
  /** Animação com significado (classe CSS; desligada por prefers-reduced-motion). */
  anim?: string
}

const LYMPH = { open: true, soft: true, dash: '1.5 2.5', sym: true } as const
const NERVE = { open: true, soft: true, sym: true } as const

export const ANATOMY: Record<BodyRegionId, Anatomy> = {
  brain: {
    base: [
      {
        t: 'path',
        d: 'M130 16.5 C120 15 110.5 21 110 31 C109.5 39 115 44.5 122 44.5 C125.5 44.5 128.5 43.5 130 42 C131.5 43.5 134.5 44.5 138 44.5 C145 44.5 150.5 39 150 31 C149.5 21 140 15 130 16.5 Z',
      },
      {
        t: 'path',
        d: 'M130 17.5 V42 M115 24 q5.5 4 0 9 M121.5 19.5 q5 6 -1 12.5 M113 36 q5.5 0.5 8 6 M145 24 q-5.5 4 0 9 M138.5 19.5 q-5 6 1 12.5 M147 36 q-5.5 0.5 -8 6',
        open: true,
      },
    ],
    detail: {
      immune_nervous: [
        { t: 'path', d: 'M130 43 V270', open: true, w: 1.8 }, // medula
        { t: 'path', d: 'M131 98 C148 100 170 104 186 114', ...NERVE }, // plexo braquial
        { t: 'path', d: 'M186 114 C194 150 199 190 203 212 C207 240 211 265 213.5 302', ...NERVE, arm: true },
        { t: 'path', d: 'M131 130 C142 131 154 136 162 146', ...NERVE },
        { t: 'path', d: 'M131 150 C142 151 154 156 164 168', ...NERVE },
        { t: 'path', d: 'M131 170 C142 171 152 176 162 190', ...NERVE },
        // Nervo ciático.
        { t: 'path', d: 'M131 262 C140 274 152 300 153 340 C153 370 149 396 149 420 C149 460 148 490 147 514', ...NERVE },
      ],
    },
    detailHit: { immune_nervous: [{ t: 'rect', x: 125, y: 44, width: 10, height: 228, rx: 5 }] },
    callout: { x: 148, y: 28, labelY: 22, side: 'right' },
  },
  eyes: {
    base: [
      { t: 'path', d: 'M134.5 51 Q140 46.5 145.5 51 Q140 55 134.5 51 Z', sym: true },
      { t: 'circle', cx: 140, cy: 51, r: 1.9, sym: true },
    ],
    hit: [{ t: 'rect', x: 110, y: 44, width: 40, height: 14, rx: 7 }],
    callout: { x: 114, y: 51, labelY: 58, side: 'left' },
    anim: 'holo-eyes',
  },
  lungs: {
    base: [
      // Pulmão esquerdo do corpo (à direita do desenho), com a incisura cardíaca.
      {
        t: 'path',
        d: 'M137.5 121 C142 116 148 118 152 126 C158 138 162.5 158 163.5 178 C164 190 162 199 157 200 C151 201 145 197 141.5 193 C144 187 150 184 149.5 176 C149 169 141 166 138.5 158 C136.5 148 136 130 137.5 121 Z',
      },
      // Pulmão direito do corpo, um pouco maior.
      {
        t: 'path',
        d: 'M122.5 121 C118 116 112 118 108 126 C102 138 97.5 158 96.5 178 C96 190 98 199 103 200 C110 201 119 196 123 190 C124.5 176 124.5 140 122.5 121 Z',
      },
      { t: 'path', d: 'M100 168 C108 160 116 158 123 160 M160 166 C154 156 146 150 140 150', open: true, soft: true },
      // Traqueia com anéis e brônquios.
      {
        t: 'path',
        d: 'M127.5 92 V116 C127 121 124 125 119 129 M132.5 92 V116 C133 121 136 125 141 129 M127.5 97 H132.5 M127.5 102 H132.5 M127.5 107 H132.5 M127.5 112 H132.5',
        open: true,
      },
    ],
    callout: { x: 100, y: 160, labelY: 146, side: 'left' },
    anim: 'holo-breathe',
  },
  heart: {
    base: [
      {
        t: 'path',
        d: 'M137 193 C124 183 121 169 126 162 C130 157 136 159 138 164 C140 158 148 156 152 162 C157 170 150 184 137 193 Z',
      },
      { t: 'path', d: 'M137 161 C136 152 143 149 147 154', open: true },
    ],
    callout: { x: 153, y: 172, labelY: 180, side: 'right' },
    anim: 'holo-beat',
  },
  bones: {
    base: [
      // Fêmur: cabeça, colo, trocânter e côndilos.
      {
        t: 'path',
        d: 'M147.5 281.5 C150 277.5 155.5 278 156.5 282.5 C159.5 283.5 163.5 285.5 164.5 290 C165.5 296 162 302 160 308 C157.5 336 155 362 155 380 C157.5 383 158.5 388 157.5 392 C156 396 151.5 396.5 149 394 C146.5 396.5 142 396 140.8 392 C140 388 141.5 383.5 144.5 380.5 C146.5 360 150.5 334 153.5 306 C154 300 153.5 294 152 290.5 C148.5 290.5 145.5 286 147.5 281.5 Z',
        sym: true,
      },
      { t: 'circle', cx: 149, cy: 399.5, r: 3.6, sym: true }, // patela
      // Tíbia.
      {
        t: 'path',
        d: 'M141 404 C141 401.5 144 401 149 401.5 C154 401 157 401.5 157 404 C157 409 154.5 412 153 417 C151.5 448 150.5 480 150.5 506 C151 510 151 514 149 516 C146.5 518 143 517 142 513.5 C142.5 508 143.5 480 144 450 C144 436 142.5 420 141.5 412 C141 409 141 406.5 141 404 Z',
        sym: true,
      },
      // Fíbula.
      {
        t: 'path',
        d: 'M157.5 409 C159.5 410 160 413 159 416 C158.5 450 156.5 485 155 508 C156 512 155.5 516.5 153.5 517 C152 516 152 512 152.5 508 C154 484 156 450 156.5 416 C156 413 156 410 157.5 409 Z',
        sym: true,
      },
    ],
    detail: {
      skeleton: [
        // Crânio: caixa craniana e mandíbula, órbitas, nariz e dentes.
        {
          t: 'path',
          d: 'M130 15 C142 15 151.5 24 151.5 40 C151.5 49 150 55 148 60 C147.5 64 146 66 144.5 67 C144 71 143 74 141 77 C138 80.5 134 82 130 82 C126 82 122 80.5 119 77 C117 74 116 71 115.5 67 C114 66 112.5 64 112 60 C110 55 108.5 49 108.5 40 C108.5 24 118 15 130 15 Z',
        },
        { t: 'ellipse', cx: 139.5, cy: 51, rx: 5, ry: 4.2, open: true, sym: true },
        { t: 'path', d: 'M130 56 L127 64.5 Q130 66.5 133 64.5 Z M122.5 72 Q130 74.5 137.5 72', open: true },
        ...VERTEBRAE,
        { t: 'path', d: 'M123.5 265 H136.5 L133 284 Q130 290 127 284 Z' }, // sacro
        { t: 'path', d: 'M126.5 116 Q130 114 133.5 116 L133 156 Q130 165 127 156 Z' }, // esterno
        { t: 'path', d: 'M133 160 C138 168 147 188 153 203', open: true, sym: true }, // arco costal
        ...RIBS,
        // Clavícula.
        { t: 'path', d: 'M133.5 113 C146 108.5 160 113.5 181 110 L181.5 113.5 C161 117 146 112 134 116.5 Z', sym: true },
        // Pelve: asa do ilíaco, ísquio e púbis.
        {
          t: 'path',
          d: 'M136.5 264 C146 252 158 248 164 252 C168 257 167 268 163.5 276 C160 282 157 287 152 292 C148 298 142 302 136 301 C133 300 131 298 130.5 294 L130.5 288 C136 286 141 280 142 273 C142 268 139.5 265 136.5 264 Z',
          sym: true,
        },
        { t: 'ellipse', cx: 141.5, cy: 293.5, rx: 4.2, ry: 3, open: true, sym: true },
        // Úmero, rádio e ulna.
        {
          t: 'path',
          d: 'M184 111 C187 107.5 193 109 193.5 114 C194 119 193.5 124 194.5 130 C197 156 200.5 182 204 200 C206.5 203 207 207 205 209.5 C202 211.5 198.5 211 197 208.5 C196 205 197.5 202 198.5 199.5 C195.5 180 191.5 156 188.5 131 C186.5 125 182 117 184 111 Z',
          sym: true,
          arm: true,
        },
        {
          t: 'path',
          d: 'M203.5 212 C205.5 211 207 212.5 207 214.5 C209.5 236 213 260 216 279 C216.5 282 214.5 283.5 213 282.5 C211.5 262 207.5 238 203.5 216 C203 214.5 203 213 203.5 212 Z',
          sym: true,
          arm: true,
        },
        {
          t: 'path',
          d: 'M198 211.5 C199.5 210.5 201.5 211.5 201.5 213.5 C203.5 236 207.5 260 211 280 C211 282.5 209 283 208 281.5 C205 262 200.5 238 197.5 215.5 C197.2 214 197.3 212.5 198 211.5 Z',
          sym: true,
          arm: true,
        },
        // Ossos da mão e do pé, só sugeridos.
        {
          t: 'path',
          d: 'M209.5 287 L207 302 M212 287 C213 300 213.5 318 213 332 M215 287 C217.5 300 218.5 314 218 327',
          open: true,
          soft: true,
          sym: true,
          arm: true,
        },
        {
          t: 'path',
          d: 'M145 521 C144 528 143 534 142 540 M148.5 521 C149 528 150.5 534 152 540 M152 521 C154 527 158 533 161 538',
          open: true,
          soft: true,
          sym: true,
        },
      ],
    },
    hit: [{ t: 'rect', x: 137, y: 277, width: 30, height: 242, rx: 10, sym: true }],
    detailHit: {
      skeleton: [
        { t: 'rect', x: 96, y: 108, width: 68, height: 100, rx: 16 },
        { t: 'rect', x: 123, y: 84, width: 14, height: 208, rx: 6 },
        { t: 'path', d: 'M182 108 L196 108 L219 282 L205 284 Z', sym: true, arm: true },
      ],
    },
    callout: { x: 104, y: 345, labelY: 372, side: 'left' },
  },
  immune: {
    base: [
      // Baço.
      {
        t: 'path',
        d: 'M147 203 C152 199.5 158 202 158.5 208 C159 214 155 218.5 150 217.5 C146.5 216.5 148.5 212 147 209 C146 207 145.5 204.5 147 203 Z',
      },
      // Timo.
      {
        t: 'path',
        d: 'M130 121 C127 118 123.5 120 124 125 C124.5 131 126.5 136 129 139 C129.6 137 130 135 130 133 C130 135 130.4 137 131 139 C133.5 136 135.5 131 136 125 C136.5 120 133 118 130 121 Z',
      },
      // Linfonodos: pescoço, axilas e virilha.
      { t: 'circle', cx: 137, cy: 89, r: 2.6, sym: true },
      { t: 'circle', cx: 172, cy: 145, r: 3, sym: true },
      { t: 'circle', cx: 168.5, cy: 153.5, r: 2.3, sym: true },
      { t: 'circle', cx: 141, cy: 285, r: 3, sym: true },
      { t: 'circle', cx: 137.5, cy: 290.5, r: 2.2, sym: true },
      // Rede de vasos linfáticos que liga os linfonodos.
      { t: 'path', d: 'M137 89 C139 100 136 112 133 122', ...LYMPH },
      { t: 'path', d: 'M172 145 C160 138 146 128 134 124', ...LYMPH },
      { t: 'path', d: 'M133 124 C134 170 135 230 138 262 C139 272 140 280 141 285', ...LYMPH },
    ],
    detail: {
      immune_nervous: [
        { t: 'path', d: 'M172 145 C182 152 192 176 200 208 C205 236 210 262 212 290', ...LYMPH, arm: true },
        { t: 'path', d: 'M141 285 C150 320 152 368 149 410 C149 450 148 486 147 512', ...LYMPH },
        { t: 'circle', cx: 149.5, cy: 408, r: 2.2, sym: true }, // linfonodos do joelho
      ],
    },
    hit: [
      { t: 'ellipse', cx: 152, cy: 209.5, rx: 9, ry: 10.5 },
      { t: 'rect', x: 122, y: 117, width: 16, height: 24, rx: 6 },
      { t: 'circle', cx: 137, cy: 89, r: 6, sym: true },
      { t: 'circle', cx: 170.5, cy: 149, r: 9, sym: true },
      { t: 'circle', cx: 139.5, cy: 287.5, r: 8, sym: true },
    ],
    callout: { x: 158, y: 209, labelY: 232, side: 'right' },
  },
}
