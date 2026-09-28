import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { shops } from '../data/shops.js'
import { LANGUAGES, useLanguage } from '../LanguageContext.jsx'
import { getLastShopId, clearLastShopId } from '../mapState.js'
import { getFavorites, subscribeFavorites, useFavorites } from '../favorites.js'

// 絞り込みの特別な値（カテゴリー名と重ならない文字列）
const FAVORITES = '__favorites__'

// 長崎によく来る海外観光客の言語＋日本語。アプリ全体（店舗の説明文など）と共通の言語リストを使う。
// （長崎港は中国発クルーズ船の寄港が多く、地理的に韓国・台湾からの観光客も多いという
// 一般的な傾向にもとづく選定で、公式統計での裏付けはしていない）
const MAP_LANGS = LANGUAGES

// OpenStreetMapの地名データにある言語別フィールド(name:xx)を、優先順位つきで参照する。
// データが無い言語・場所ではより上位の候補（英語→現地語）にフォールバックする。
const NAME_FIELD_CHAINS = {
  en: ['name:en', 'name_en', 'name:latin', 'name'],
  zhCN: ['name:zh-Hans', 'name:zh', 'name:en', 'name'],
  zhTW: ['name:zh-Hant', 'name:zh', 'name:en', 'name'],
  ko: ['name:ko', 'name:en', 'name'],
  ja: ['name:ja', 'name'],
}

function buildTextField(lang) {
  const expr = ['coalesce']
  NAME_FIELD_CHAINS[lang].forEach((f) => expr.push(['get', f]))
  return expr
}

// 実地図（MapLibre GL + OpenFreeMap、APIキー不要）。
// もう一つのプロトタイプアプリ（NagaGo/Dejima Dish）で使っている地図の実装方式を移植したもの:
//   ・OpenFreeMapの「positron」スタイル（シンプルな配色の地図）に、建物データから3D押し出しを追加
//   ・店舗ピンはカテゴリー別の線画アイコンを乗せた丸バッジ
//   ・パン/ズームは長崎駅〜思案橋のエリアだけに制限
// レイアウト・サイズ（aspect-square, rounded-2xl 等）は元のMapViewを踏襲し、
// Home/MapPageなど呼び出し側の見た目は変えていない。

const CATEGORY_ICON_PATHS = {
  Izakaya: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M9 4.2c-.9.9-.9 2 0 2.9M12.3 3.4c-.9.9-.9 2 0 2.9M15.6 4.2c-.9.9-.9 2 0 2.9"/>',
  Bar: '<path d="M5 4h14l-6.2 7.4V18h3"/><path d="M9 18h4"/><path d="M5.8 7.2h12.4"/>',
  Yakiniku: '<path d="M12 21c4 0 6-2.5 6-6 0-3-2-4.5-2-4.5.3 2-1 3-1 3 .3-3.5-2.5-5-2.5-8.5-1.5 1.5-3 3.5-3 6 0 1-1 1.7-1 1.7C7 14 6 15.5 6 17c0 2.5 2 4 6 4Z"/>',
  'Cafe & Bar': '<path d="M5 9h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Z"/><path d="M16 10.2h1.3a2.4 2.4 0 0 1 0 4.8H16"/><path d="M8.2 5.2c-.8.8-.8 1.8 0 2.6M11.7 4.4c-.8.8-.8 1.8 0 2.6"/>',
  // 中華街の店（ちゃんぽんの丼と湯気）。他の飲食店と一目で見分けられるようにしている。
  Chinese: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M6.5 19h11"/><path d="M9.5 4.5c-.9.9-.9 2 0 2.9M12.5 3.6c-.9.9-.9 2 0 2.9M15.5 4.5c-.9.9-.9 2 0 2.9"/>',
}

// ピンの見た目をカテゴリーごとに変える。
// 中華街は「別のマーク」として分かるよう、白地ではなく塗りにしている。
// 色は朱色(#e0453e)そのままだと強すぎるため、少し淡い赤にしている。
const CATEGORY_BADGE = {
  Chinese: 'bg-[#ef8b84] text-white ring-2 ring-white',
}
const DEFAULT_BADGE = 'bg-white text-vermilion ring-2 ring-white'
const DEFAULT_ICON_PATH =
  '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M9 4.2c-.9.9-.9 2 0 2.9M12.3 3.4c-.9.9-.9 2 0 2.9M15.6 4.2c-.9.9-.9 2 0 2.9"/>'

function iconSvg(category, size = 17) {
  const path = CATEGORY_ICON_PATHS[category] || DEFAULT_ICON_PATH
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">${path}</svg>`
}

// 実際にshopsデータへ登場する順番で、カテゴリーの一覧を作る
// （新しいカテゴリーのお店を追加するだけで、この凡例にも自動で反映される）
const CATEGORIES = shops.reduce((list, shop) => {
  if (!list.includes(shop.category)) list.push(shop.category)
  return list
}, [])

// 長崎市中心部の観光エリア全体をカバーする範囲に制限する。
// （グラバー園・大浦天主堂〜長崎駅〜平和公園、西は稲佐山まで）
// 掲載店舗は思案橋・銅座・新地中華街に集中しているが、観光客は平和公園や稲佐山にも
// 足を運ぶため、そこで開いても現在地が地図に入るだけの広さを確保している。
// 東西幅が南北幅よりかなり狭いと、maxBoundsに収めるためのズーム制約で
// 東西にはほぼパンできず上下方向だけ動かせる状態になってしまうため、
// 東西方向にも南北と同程度の広さを持たせてある。
const MAP_BOUNDS = [
  [129.835, 32.72], // 南西
  [129.905, 32.79], // 北東
]

// 現在地が地図の範囲内かどうか
function isInsideBounds(lng, lat) {
  const [[west, south], [east, north]] = MAP_BOUNDS
  return lng >= west && lng <= east && lat >= south && lat <= north
}

// 現在地が取れない・範囲外のときに地図の上に出す一言。
// 表示中の言語（LanguageContext）に合わせて切り替える。
const NOTE_TEXT = {
  outside: {
    en: 'You are outside this map area.',
    zhCN: '您当前位置在本地图范围之外。',
    zhTW: '您目前位置在本地圖範圍之外。',
    ko: '현재 위치가 이 지도 범위 밖입니다.',
    ja: '現在地はこの地図の範囲外です。',
  },
  denied: {
    en: 'Location is off. Turn it on in your browser settings.',
    zhCN: '定位已关闭，请在浏览器设置中开启。',
    zhTW: '定位已關閉，請在瀏覽器設定中開啟。',
    ko: '위치 정보가 꺼져 있습니다. 브라우저 설정에서 켜 주세요.',
    ja: '位置情報がオフです。ブラウザの設定でオンにしてください。',
  },
  unavailable: {
    en: 'Could not get your location.',
    zhCN: '无法获取您的位置。',
    zhTW: '無法取得您的位置。',
    ko: '위치를 가져올 수 없습니다.',
    ja: '現在地を取得できませんでした。',
  },
}

export default function MapView({ className = '' }) {
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const controlsWrapperRef = useRef(null)
  const mapRef = useRef(null)
  const labelLayerIdsRef = useRef([])
  const markersRef = useRef([]) // { shop, el }[]
  const { lang, setLang } = useLanguage() // アプリ全体と共有の言語（店舗の説明文もこれに連動する）
  const [activeCategory, setActiveCategory] = useState(null) // nullは「すべて」
  const [note, setNote] = useState(null) // 'outside' | 'denied' | 'unavailable' | null
  const activeCategoryRef = useRef(null)
  const favorites = useFavorites() // 件数表示と、ボタンの出し分けに使う

  // ピンの絞り込みを、既に作成済みのマーカーの表示/非表示だけで行う（作り直さない）
  // activeCategoryRef は null（すべて）／FAVORITES（お気に入りだけ）／カテゴリー名 のいずれか。
  const applyCategoryFilter = () => {
    const active = activeCategoryRef.current
    const favs = active === FAVORITES ? getFavorites() : null
    markersRef.current.forEach(({ shop, el }) => {
      const show = !active || (favs ? favs.includes(shop.id) : shop.category === active)
      el.style.display = show ? 'flex' : 'none'
    })
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      const style = await fetch('https://tiles.openfreemap.org/styles/positron').then((r) => r.json())
      if (cancelled || !containerRef.current) return

      // 地名・道路名などのラベルレイヤーを見つけて、初期言語のテキストに差し替えておく
      const labelLayerIds = []
      style.layers.forEach((layer) => {
        const tf = layer.layout && layer.layout['text-field']
        if (tf && JSON.stringify(tf).includes('"name')) {
          labelLayerIds.push(layer.id)
          layer.layout['text-field'] = buildTextField(lang)
        }
      })
      labelLayerIdsRef.current = labelLayerIds

      // 建物データにrender_height/render_min_heightがあるため、3D押し出しレイヤーを追加する
      const buildingIndex = style.layers.findIndex((l) => l.id === 'building')
      if (buildingIndex !== -1) {
        style.layers.splice(buildingIndex + 1, 0, {
          id: 'building-3d',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': ['coalesce', ['get', 'colour'], '#d9d3c6'],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.85,
          },
        })
      }

      // 直前に店舗ページを開いていたら、その店のピンを中心に表示する。
      // （初期位置に戻ってしまうと、どの店を見ていたのか分からなくなるため）
      const lastShop = shops.find((s) => s.id === getLastShopId())
      clearLastShopId()

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: lastShop?.geo ? [lastShop.geo.lng, lastShop.geo.lat] : [129.8712, 32.7455],
        zoom: lastShop ? 16.5 : 14.6,
        pitch: 50,
        bearing: -14,
        maxBounds: MAP_BOUNDS,
        attributionControl: true,
      })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      // 現在地ボタン。押すと現在地の許可を求め、許可されれば地図上に自分の位置を表示する
      const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
        showAccuracyCircle: true,
      })
      map.addControl(geolocate, 'top-right')

      // 現在地が取れたとき：地図の範囲外なら青い点が画面に入ってこないので、その旨を知らせる
      // （範囲外でも位置情報自体は取れているため、何も出さないと「壊れている」ように見える）
      geolocate.on('geolocate', (e) => {
        setNote(isInsideBounds(e.coords.longitude, e.coords.latitude) ? null : 'outside')
      })
      // 許可されなかった／取得できなかったとき
      geolocate.on('error', (err) => {
        setNote(err?.code === 1 ? 'denied' : 'unavailable')
      })

      // ボタンを押させず、地図を開いた瞬間に位置情報の許可ダイアログを出す
      // （trigger()はボタンを押したのと同じ動作をコードから呼び出すメソッド）
      map.on('load', () => geolocate.trigger())

      map.on('load', () => {
        // 右上のズーム＋現在地ボタンだけは、マップ本体とは別のフェードのかからない
        // レイヤーへ移し替える（薄くなってほしくないため）。地図帰属表示（右下）は対象外。
        const topRightCtrl = containerRef.current?.querySelector('.maplibregl-ctrl-top-right')
        if (topRightCtrl && controlsWrapperRef.current) {
          controlsWrapperRef.current.appendChild(topRightCtrl)
        }

        markersRef.current = []
        shops.forEach((shop) => {
          if (shop.geo?.lat == null || shop.geo?.lng == null) return

          const el = document.createElement('button')
          el.type = 'button'
          el.setAttribute('aria-label', `${shop.name} (${shop.category})`)
          el.className = `flex h-[38px] w-[38px] items-center justify-center rounded-full shadow-hand ${
            CATEGORY_BADGE[shop.category] || DEFAULT_BADGE
          }`
          el.innerHTML = iconSvg(shop.category)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            navigate(`/shop/${shop.id}`)
          })

          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([shop.geo.lng, shop.geo.lat])
            .addTo(map)

          markersRef.current.push({ shop, el })
        })
        // 凡例で既に選ばれている種類があれば、マーカー作成直後にも反映する
        applyCategoryFilter()
      })
    }

    init()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [navigate])

  // お気に入りが増減したら、絞り込み中の表示も追従させる
  useEffect(() => subscribeFavorites(applyCategoryFilter), [])

  // 言語ボタンが押されたら、地図上の地名ラベルだけを差し替える（ピン・店舗データには影響しない）
  const handleLangChange = (code) => {
    setLang(code)
    const map = mapRef.current
    if (!map) return
    const expr = buildTextField(code)
    labelLayerIdsRef.current.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', expr)
    })
  }

  // 凡例のアイコンが押されたら、その種類のピンだけを表示する（もう一度押すと解除）
  const handleCategoryClick = (category) => {
    const next = activeCategory === category ? null : category
    activeCategoryRef.current = next
    setActiveCategory(next)
    applyCategoryFilter()
  }

  return (
    <div className={className}>
      {/* この内側のrelativeが地図カードそのもの。言語ボタンをこの角に重ねるので、
          凡例（この下に続く別要素）の高さに影響されず常に地図の左下に留まる。 */}
      <div className="relative">
        {/* 縁をくっきりしたカード枠にせず、四角形のまま上下左右均等に背景（夜景）へ溶け込ませる。
            円形にはせず、縦横それぞれの辺に沿ったグラデーションを重ねて（mask-composite）
            四隅も含めて全方向同じ幅・同じ強さでフェードするようにしている。 */}
        <div
          ref={containerRef}
          className="aspect-square w-full"
          style={{
            maskImage:
              'linear-gradient(to right, transparent, black 12%, black 88%, transparent), ' +
              'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
            maskComposite: 'intersect',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 12%, black 88%, transparent), ' +
              'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
            WebkitMaskComposite: 'source-in',
          }}
        />

        {/* ズーム＋現在地ボタン（MapLibreの標準コントロール）の置き場所。
            マップ本体とは別要素なので、フェードの影響を受けず常にはっきり表示される。 */}
        <div ref={controlsWrapperRef} className="pointer-events-none absolute inset-0 z-10" />

        {/* 現在地についての一言（範囲外・許可なし・取得失敗）。押すと消える。 */}
        {note && (
          <button
            type="button"
            onClick={() => setNote(null)}
            className="press absolute left-1/2 top-3 z-10 max-w-[85%] -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 font-hand text-[11px] font-semibold leading-snug text-navy/80 shadow-hand"
          >
            {NOTE_TEXT[note][lang] || NOTE_TEXT[note].en}
          </button>
        )}

        {/* 地図上の地名の表示言語切り替え */}
        <div className="absolute bottom-3 left-3 z-10 flex gap-1 rounded-full bg-white/95 p-1 shadow-hand">
          {MAP_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => handleLangChange(l.code)}
              className={`press flex h-6 w-6 items-center justify-center rounded-full font-hand text-[11px] font-bold ${
                lang === l.code ? 'bg-vermilion text-white' : 'text-navy/70'
              }`}
              aria-pressed={lang === l.code}
              aria-label={`Map labels: ${l.label}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* 種類別の凡例。押すとその種類のピンだけが地図上に残る */}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => handleCategoryClick(null)}
          className={`press flex items-center gap-1.5 rounded-full px-3 py-1.5 font-hand text-xs font-semibold shadow-hand ${
            activeCategory === null ? 'bg-vermilion text-white' : 'bg-white text-navy/70'
          }`}
          aria-pressed={activeCategory === null}
        >
          All
        </button>
        {/* お気に入りだけ表示（1軒でも登録されていれば出す） */}
        {favorites.length > 0 && (
          <button
            type="button"
            onClick={() => handleCategoryClick(FAVORITES)}
            className={`press flex items-center gap-1.5 rounded-full px-3 py-1.5 font-hand text-xs font-semibold shadow-hand ${
              activeCategory === FAVORITES ? 'bg-vermilion text-white' : 'bg-white text-vermilion'
            }`}
            aria-pressed={activeCategory === FAVORITES}
            aria-label="Saved shops"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z" />
            </svg>
            <span>{favorites.length}</span>
          </button>
        )}
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => handleCategoryClick(category)}
            className={`press flex items-center gap-1.5 rounded-full px-3 py-1.5 font-hand text-xs font-semibold shadow-hand ${
              activeCategory === category ? 'bg-vermilion text-white' : 'bg-white text-navy/70'
            }`}
            aria-pressed={activeCategory === category}
            dangerouslySetInnerHTML={{
              __html: `${iconSvg(category, 14)}<span>${category}</span>`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
