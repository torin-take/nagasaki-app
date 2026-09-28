import { useRef, useState, useLayoutEffect } from 'react'
import HomeCard from '../components/HomeCard.jsx'
import NightView from '../components/NightView.jsx'
import MapView from '../components/MapView.jsx'
import InstallPrompt from '../components/InstallPrompt.jsx'
import { FeedbackIcon } from '../components/icons/NagasakiIcons.jsx'
import { shouldPlayIntro } from '../introState.js'

// ホーム画面。
// 長崎の夜景をフルスクリーンのヒーローに据え、その中央にマップを直接埋め込む。
// マップは縁を放射状グラデーションでフェードさせ、夜景の背景と溶け込ませている。
// 右下にアンケートの小さなボタンを置く。
export default function Home() {
  const titleRef = useRef(null)
  const [heroReady, setHeroReady] = useState(false)
  // このマウントで導入アニメを再生するか（＝まだアプリ内で遷移していない起動直後のみ）。
  // 副作用のない読み取りだけなので StrictMode の二重呼び出しでも安全。
  const [playIntro] = useState(() => shouldPlayIntro())

  // タイトルの「中央→左上へ移動」演出のため、定位置での実寸・座標を測って
  // 「中心を画面中央へ運ぶ px 量」を CSS 変数にセットする（%指定に依存せず正確に中央化）。
  // 初回（導入再生時）のみ実行。
  useLayoutEffect(() => {
    if (!playIntro) return
    const el = titleRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const tx = window.innerWidth / 2 - (rect.left + rect.width / 2)
    const ty = window.innerHeight / 2 - (rect.top + rect.height / 2)
    el.style.setProperty('--hero-tx', `${tx}px`)
    el.style.setProperty('--hero-ty', `${ty}px`)
    setHeroReady(true)
  }, [playIntro])

  return (
    <main
      className={`relative flex min-h-dvh flex-col overflow-hidden bg-night text-white ${
        playIntro ? 'intro' : ''
      }`}
    >
      {/* 背景：長崎の夜景（フルブリード） */}
      <NightView className="absolute inset-0 h-full w-full" />

      {/* 文字とマップを読みやすくするオーバーレイ */}
      <div className="absolute inset-0 bg-gradient-to-b from-night/30 via-night/25 to-night/90" />

      {/* コンテンツ */}
      <div className="relative z-10 flex min-h-dvh w-full flex-col overflow-hidden px-6 pb-8 pt-12">
        {/* タイトル（周囲点灯後 → 中央に大きく → 左上へ移動して収まる） */}
        <header>
          <p
            className="anim-fade-up text-xs font-semibold uppercase tracking-[0.5em] text-gold"
            style={{ animationDelay: '2.5s' }}
          >
            Discover
          </p>
          <h1
            ref={titleRef}
            className={`mt-1 inline-block font-display uppercase leading-[0.9] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] text-[clamp(2.25rem,11vw,3.5rem)] ${
              playIntro ? (heroReady ? 'anim-title' : 'opacity-0') : ''
            }`}
            style={{ animationDelay: '1s' }}
          >
            Nagasaki
          </h1>
        </header>

        {/* 中央に埋め込んだマップ（タイトルが定位置に収まってから表示） */}
        <div
          className="anim-fade-up flex flex-1 flex-col items-center justify-center"
          style={{ animationDelay: '2.6s' }}
        >
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-gold/90">
            City Map
          </p>
          <MapView className="w-full max-w-sm" />
        </div>

        {/* アンケート：小さく右下 */}
        <div className="anim-fade-up flex justify-end" style={{ animationDelay: '2.8s' }}>
          <HomeCard to="/survey" variant="mini" title="Feedback" icon={<FeedbackIcon size={18} />} />
        </div>
      </div>

      {/* 「ホーム画面に追加」の案内（ホーム画面から起動済み・一度閉じた場合は出ない） */}
      <InstallPrompt />
    </main>
  )
}
