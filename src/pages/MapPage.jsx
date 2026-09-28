import BackButton from '../components/BackButton.jsx'
import MapView from '../components/MapView.jsx'
import NightView from '../components/NightView.jsx'

// マップの全画面表示（ホームからは直接埋め込むため通常は使わないが、
// /map に直接アクセスされた場合のフォールバックとして夜景背景で表示する）。
export default function MapPage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-night text-white">
      <NightView className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-night/40 via-night/30 to-night/90" />

      <div className="relative z-10 flex min-h-dvh flex-col px-6 pb-10 pt-6">
        <div className="mb-4">
          <BackButton />
        </div>
        <header className="mb-2 text-center">
          <h1 className="font-display text-3xl uppercase tracking-wide text-white">Nagasaki Map</h1>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <MapView className="w-full max-w-md" />
        </div>
      </div>
    </main>
  )
}
