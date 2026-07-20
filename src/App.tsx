import { useEffect, useRef, useState } from 'react'
import { loginWithEmailCode, loginWithPhoneCode, sendEmailVerificationCode, sendPhoneVerificationCode } from '@howone/sdk'
import { Camera, CloudRain, Compass, ExternalLink, ImagePlus, Languages, LogOut, MapPin, Mic, Play, RotateCcw, Search, ShieldCheck, Sparkles, UserRound, Volume2, X } from 'lucide-react'
import howone from '@/lib/sdk'

type SignedInUser = { id: string; email?: string; name?: string }
type Place = { displayName: string; lat: number; lon: number; osmUrl: string }
type Weather = { label: string; temperature: number; apparent: number; observedAt: string }
type GuideSource = { name: string; url: string; excerpt: string }

const WEATHER_SOURCE = 'https://open-meteo.com/en/docs'
const OSM_SOURCE = 'https://www.openstreetmap.org/copyright'

function weatherLabel(code: number) {
  if (code === 0) return '晴朗'
  if (code <= 3) return '多云'
  if (code <= 48) return '有雾'
  if (code <= 67) return '有雨'
  if (code <= 77) return '有雪'
  return '有雷暴'
}

function App() {
  const [active, setActive] = useState<'plan' | 'guide' | 'translate' | 'voice' | 'live'>('plan')
  const [showLogin, setShowLogin] = useState(false)
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loginStep, setLoginStep] = useState<'identity' | 'code'>('identity')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<SignedInUser | null>(null)
  const [notice, setNotice] = useState('')
  const [placeQuery, setPlaceQuery] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [placeState, setPlaceState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [weather, setWeather] = useState<Weather | null>(null)
  const [weatherState, setWeatherState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [trip, setTrip] = useState({ title: '', arrivalDate: '', departureDate: '', familySummary: '', preferences: '' })
  const [itinerary, setItinerary] = useState<string | null>(null)
  const [itineraryState, setItineraryState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [guideSource, setGuideSource] = useState<GuideSource | null>(null)
  const [guideText, setGuideText] = useState<string | null>(null)
  const [guideState, setGuideState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [translation, setTranslation] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [translateState, setTranslateState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [voiceDirection, setVoiceDirection] = useState<'zh-en' | 'en-zh'>('zh-en')
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'processing' | 'error'>('idle')
  const [voiceError, setVoiceError] = useState('')
  const [voiceTurns, setVoiceTurns] = useState<Array<{ id: string; original: string; translation: string; direction: 'zh-en' | 'en-zh'; audioUrl: string }>>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const liveDirection = 'zh-en' as const
  const [liveScenario, setLiveScenario] = useState('日常交流')
  const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'connected' | 'paused' | 'error'>('idle')
  const [liveError, setLiveError] = useState('')
  const [liveAutoPlay, setLiveAutoPlay] = useState(true)
  const [liveTurns, setLiveTurns] = useState<Array<{ id: string; original: string; translation: string; direction: 'zh-en' | 'en-zh' }>>([])
  const liveSocketRef = useRef<WebSocket | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const liveAudioContextRef = useRef<AudioContext | null>(null)
  const liveAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const liveAudioWorkletRef = useRef<AudioWorkletNode | null>(null)
  const liveAudioSinkRef = useRef<GainNode | null>(null)
  const liveAudioRef = useRef<HTMLAudioElement | null>(null)
  const liveAudioChunksRef = useRef<Uint8Array[]>([])
  const liveDraftRef = useRef({ original: '', translation: '' })
  const liveStartRef = useRef(false)
  const liveEndingRef = useRef(false)
  const liveAutoPlayRef = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let activeSession = true
    howone.me().then(profile => { if (activeSession && profile) setUser(profile as SignedInUser) }).catch(() => undefined).finally(() => { if (activeSession) setAuthLoading(false) })
    return () => { activeSession = false }
  }, [])
  useEffect(() => { liveAutoPlayRef.current = liveAutoPlay }, [liveAutoPlay])
  useEffect(() => () => {
    liveAudioWorkletRef.current?.disconnect(); liveAudioSourceRef.current?.disconnect(); liveAudioSinkRef.current?.disconnect(); void liveAudioContextRef.current?.close(); liveSocketRef.current?.close(); liveStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  function requireLogin() { if (user) return true; setShowLogin(true); setLoginError(''); return false }
  async function sendCode() {
    const identity = authMethod === 'phone' ? phone.trim() : email.trim()
    if (authMethod === 'phone' && !/^\+[1-9]\d{7,14}$/.test(identity)) { setLoginError('请输入国际格式手机号，例如 +447700900123。'); return }
    if (authMethod === 'email' && !identity.includes('@')) { setLoginError('请输入有效的邮箱地址。'); return }
    setLoginBusy(true); setLoginError('')
    try {
      if (authMethod === 'phone') await sendPhoneVerificationCode(identity, '英伦旅伴')
      else await sendEmailVerificationCode(identity, '英伦旅伴')
      setLoginStep('code'); setNotice(authMethod === 'phone' ? '验证码已发送至你的手机。' : '验证码已发送，请在邮箱中查收。')
    } catch { setLoginError(authMethod === 'phone' ? '短信验证码暂时无法发送，请稍后再试或改用邮箱登录。' : '验证码暂时无法发送，请稍后再试。') } finally { setLoginBusy(false) }
  }
  async function completeLogin() {
    if (!code.trim()) { setLoginError('请输入收到的验证码。'); return }
    setLoginBusy(true); setLoginError('')
    try {
      const identity = authMethod === 'phone' ? phone.trim() : email.trim()
      const result = authMethod === 'phone' ? await loginWithPhoneCode(identity, code) : await loginWithEmailCode(identity, code)
      if (!result.success || !result.token) throw new Error('login')
      howone.auth.setToken(result.token); const profile = await howone.me({ refresh: true }); if (!profile) throw new Error('profile')
      setUser(profile as SignedInUser); setShowLogin(false); setNotice('已登录。你创建的旅行记录仅保存在自己的账户中。')
    } catch { setLoginError('验证码不正确或已失效，请重新获取。') } finally { setLoginBusy(false) }
  }
  async function signOut() { await howone.auth.logout({ redirect: false }); setUser(null); clearCreatedResults(); setNotice('你已退出登录。') }
  function clearCreatedResults() { setItinerary(null); setGuideSource(null); setGuideText(null); setAudioUrl(null); setTranslation(null); setImagePreview(null) }

  async function searchPlaces() {
    if (!placeQuery.trim()) { setPlaceState('error'); setNotice('请输入英国城市、景点或地址后再查询。'); return }
    setPlaceState('loading'); setPlaces([]); setSelectedPlace(null); setWeather(null); clearCreatedResults()
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=gb&q=${encodeURIComponent(placeQuery)}`
      const response = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('place')
      const data = await response.json() as Array<{ display_name: string; lat: string; lon: string; osm_type: string; osm_id: string }>
      const parsed = data.map(item => ({ displayName: item.display_name, lat: Number(item.lat), lon: Number(item.lon), osmUrl: `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}` }))
      setPlaces(parsed); setPlaceState('idle'); if (!parsed.length) setNotice('未找到可用地点。请使用更完整的英文或中文地点名称重试。')
    } catch { setPlaceState('error'); setNotice('地点服务暂不可用。未显示任何替代地点，请稍后重试。') }
  }
  async function selectPlace(place: Place) {
    setSelectedPlace(place); setWeather(null); setWeatherState('loading'); clearCreatedResults()
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`
      const response = await fetch(url); if (!response.ok) throw new Error('weather')
      const data = await response.json() as { current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; time: string } }
      if (!data.current) throw new Error('weather')
      setWeather({ label: weatherLabel(data.current.weather_code), temperature: data.current.temperature_2m, apparent: data.current.apparent_temperature, observedAt: data.current.time }); setWeatherState('idle')
    } catch { setWeatherState('error'); setNotice('天气服务暂不可用。不会用估算天气替代。') }
  }
  async function generateItinerary() {
    if (!requireLogin()) return
    if (!selectedPlace || !trip.title || !trip.arrivalDate || !trip.departureDate || !trip.familySummary || !trip.preferences) { setItineraryState('error'); setNotice('请先填写完整行程信息并选择目的地。'); return }
    setItineraryState('loading'); setItinerary(null)
    try {
      const savedTrip = await howone.entities.Trip.create({ title: trip.title, arrivalDate: trip.arrivalDate, departureDate: trip.departureDate, destinations: [selectedPlace.displayName], familySummary: trip.familySummary, preferences: trip.preferences })
      const weatherContext = weather ? `${selectedPlace.displayName}：${weather.label}，${weather.temperature}°C，体感 ${weather.apparent}°C，数据时间 ${weather.observedAt}。来源 Open-Meteo。` : '当前天气数据未能取得，请不要假设天气情况。'
      const result = await howone.ai.generateFamilyItinerary.run({ trip_brief: `目的地：${selectedPlace.displayName}（坐标 ${selectedPlace.lat}, ${selectedPlace.lon}）。抵达：${trip.arrivalDate}。离开：${trip.departureDate}。家庭：${trip.familySummary}。偏好：${trip.preferences}。仅基于此用户填写信息和提供的真实地点信息安排，不要虚构场馆开放或临时关闭状态。`, weather_context: weatherContext, language: '简体中文' })
      await howone.entities.ItineraryDay.create({ tripId: savedTrip.id, dayNumber: 1, title: trip.title, planContent: result.itinerary_plan, status: 'ready', weatherSummary: weather ? weatherContext : null })
      setItinerary(result.itinerary_plan); setItineraryState('idle'); setNotice('行程已生成并保存到你的私密账户。')
    } catch { setItineraryState('error'); setNotice('行程生成失败，未使用任何预设行程替代。请检查输入后重试。') }
  }
  async function loadGuideSource() {
    if (!requireLogin()) return
    if (!selectedPlace) { setGuideState('error'); setNotice('请先从地点搜索结果中选择景点。'); return }
    setGuideState('loading'); setGuideSource(null); setGuideText(null); setAudioUrl(null)
    const rawPlaceName = selectedPlace.displayName.split(',')[0].split(';')[0].trim()
    const candidates = Array.from(new Set([placeQuery.trim(), rawPlaceName].filter(Boolean)))
    try {
      let resolved: { title: string; extract: string; language: 'zh' | 'en' } | null = null
      for (const language of ['zh', 'en'] as const) {
        for (const query of candidates) {
          const searchUrl = `https://${language}.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(query)}`
          const searchResponse = await fetch(searchUrl)
          if (searchResponse.status === 429) throw new Error('rate')
          if (!searchResponse.ok) continue
          const searchData = await searchResponse.json() as { query?: { search?: Array<{ title?: string }> } }
          const title = searchData.query?.search?.[0]?.title
          if (!title || title.includes(';')) continue
          const extractUrl = `https://${language}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1200&format=json&origin=*&titles=${encodeURIComponent(title)}`
          const extractResponse = await fetch(extractUrl)
          if (extractResponse.status === 429) throw new Error('rate')
          if (!extractResponse.ok) continue
          const extractData = await extractResponse.json() as { query?: { pages?: Record<string, { title?: string; extract?: string; missing?: string }> } }
          const page = Object.values(extractData.query?.pages ?? {})[0]
          if (page?.title && page.extract?.trim() && !page.missing) { resolved = { title: page.title, extract: page.extract, language }; break }
        }
        if (resolved) break
      }
      if (!resolved) throw new Error('no-result')
      const host = resolved.language === 'zh' ? 'zh.wikipedia.org' : 'en.wikipedia.org'
      setGuideSource({ name: resolved.title, url: `https://${host}/wiki/${encodeURIComponent(resolved.title.replaceAll(' ', '_'))}`, excerpt: resolved.extract }); setGuideState('idle'); setNotice(`已取得 ${resolved.language === 'zh' ? '中文' : '英文'} Wikipedia 公开资料，可继续生成导览。`)
    } catch (error) {
      setGuideState('error')
      setNotice(error instanceof Error && error.message === 'rate' ? '景点资料服务正在限流。请稍等后再试。' : '暂时未找到景点资料。请尝试更具体的地点名称，或重新查询其他地点。')
    }
  }
  async function generateGuide() {
    if (!requireLogin() || !selectedPlace || !guideSource) return
    setGuideState('loading'); setGuideText(null); setAudioUrl(null)
    try {
      const result = await howone.ai.generateAttractionGuide.run({ attraction_name: selectedPlace.displayName, guide_language: '简体中文', visitor_context: `仅根据以下公开资料生成亲子中文导览；明确标注为 AI 生成解读，不要补充资料中没有的事实。来源：${guideSource.name}。资料摘录：${guideSource.excerpt}` })
      await howone.entities.AttractionGuide.create({ attractionName: selectedPlace.displayName, guideText: result.guide_text, locationLabel: `${selectedPlace.lat}, ${selectedPlace.lon}`, sourceName: guideSource.name, sourceUrl: guideSource.url, sourceExcerpt: guideSource.excerpt })
      setGuideText(result.guide_text); setGuideState('idle'); setNotice('导览已生成，并已保存来源链接与资料摘录。')
    } catch { setGuideState('error'); setNotice('导览生成失败，未显示预设导览内容。') }
  }
  async function generateAudio() {
    if (!requireLogin() || !guideText) { if (!guideText) setNotice('请先创建中文导览。'); return }
    setAudioState('loading'); setAudioUrl(null)
    try { const result = await howone.ai.generateChineseAudioGuide.run({ guide_script: guideText, audio_language: '中文', voice_hint: 'calm family-friendly female voice' }); setAudioUrl(result.audio_url); setAudioState('idle'); setNotice('语音已根据刚生成的导览创建。') }
    catch { setAudioState('error'); setNotice('语音生成失败，未播放任何演示音频。') }
  }
  async function handleImage(file?: File) {
    if (!file || !requireLogin()) return
    setImagePreview(URL.createObjectURL(file)); setTranslation(null); setTranslateState('loading')
    try { const uploaded = await howone.upload.image(file); const result = await howone.ai.translateTravelImage.run({ source_image_url: uploaded.url, target_language: '简体中文', translation_context: '用户上传的旅行英文信息图片' }); await howone.entities.TranslationHistory.create({ sourceImageUrl: uploaded.url, sourceLabel: file.name, translatedText: result.translated_text, annotatedImageUrl: result.annotated_image_url ?? null, translationContext: '用户上传的旅行英文信息图片' }); setTranslation(result.translated_text); setTranslateState('idle'); setNotice('图片翻译已保存到你的私密账户。') }
    catch { setTranslateState('error'); setNotice('图片翻译失败，未显示任何预设翻译结果。') }
  }
  async function processVoiceTurn(blob: Blob, direction: 'zh-en' | 'en-zh') {
    setVoiceState('processing'); setVoiceError('')
    try {
      const form = new FormData()
      form.append('audio', new File([blob], 'travel-turn.webm', { type: blob.type || 'audio/webm' }))
      form.append('direction', direction)
      form.append('context', voiceTurns.slice(-3).map(turn => `${turn.original} → ${turn.translation}`).join('\n'))
      const response = await fetch('/api/voice-turn', { method: 'POST', body: form })
      const payload = await response.json() as { original?: string; translation?: string; audioBase64?: string; audioMimeType?: string; error?: string }
      if (!response.ok || !payload.original || !payload.translation || !payload.audioBase64) throw new Error(payload.error || '语音服务暂不可用，请稍后重试。')
      const audioUrl = `data:${payload.audioMimeType || 'audio/mpeg'};base64,${payload.audioBase64}`
      setVoiceTurns(turns => [...turns, { id: crypto.randomUUID(), original: payload.original!, translation: payload.translation!, direction, audioUrl }].slice(-8))
      setVoiceState('idle')
    } catch (error) { setVoiceState('error'); setVoiceError(error instanceof Error ? error.message : '网络连接出现问题，请重试。') }
  }
  async function startVoiceTurn() {
    if (!requireLogin()) return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setVoiceState('error'); setVoiceError('此浏览器不支持录音。请使用支持麦克风录音的浏览器。'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); void processVoiceTurn(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), voiceDirection) }
      recorderRef.current = recorder; recorder.start(); setVoiceState('recording'); setVoiceError('')
    } catch { setVoiceState('error'); setVoiceError('未获得麦克风权限。请在浏览器设置中允许麦克风后重试。') }
  }
  function stopVoiceTurn() { if (recorderRef.current?.state === 'recording') recorderRef.current.stop() }
  function playVoiceTurn(url: string) { void new Audio(url).play().catch(() => { setVoiceError('无法开始播放。请检查设备音量或重试。') }) }
  function liveInstructions(direction: 'zh-en' | 'en-zh') {
    const source = direction === 'zh-en' ? 'Chinese' : 'English'
    const target = direction === 'zh-en' ? 'English' : 'Simplified Chinese'
    return `You are a live travel interpreter for a ${liveScenario} conversation in the UK. Listen to ${source} and immediately speak only a natural ${target} translation. Do not add explanations, labels, greetings, or answers of your own. Preserve names, numbers, prices, addresses, and requests exactly. Keep every response concise.`
  }
  function endLiveSession(clear = true) {
    liveEndingRef.current = true
    if (liveSocketRef.current?.readyState === WebSocket.OPEN) liveSocketRef.current.send(JSON.stringify({ type: 'stop' }))
    liveAudioWorkletRef.current?.disconnect(); liveAudioSourceRef.current?.disconnect(); liveAudioSinkRef.current?.disconnect(); void liveAudioContextRef.current?.close(); liveSocketRef.current?.close(); liveStreamRef.current?.getTracks().forEach(track => track.stop())
    liveAudioWorkletRef.current = null; liveAudioSourceRef.current = null; liveAudioSinkRef.current = null; liveAudioContextRef.current = null; liveSocketRef.current = null; liveStreamRef.current = null; liveStartRef.current = false
    if (liveAudioRef.current) { liveAudioRef.current.pause(); liveAudioRef.current = null }
    liveAudioChunksRef.current = []
    if (clear) setLiveTurns([])
    setLiveState('idle')
  }
  function commitLiveTurn() {
    const draft = liveDraftRef.current
    if (!draft.original.trim() && !draft.translation.trim()) return
    setLiveTurns(turns => [...turns, { id: crypto.randomUUID(), original: draft.original.trim() || '…', translation: draft.translation.trim() || '…', direction: liveDirection }].slice(-10))
    liveDraftRef.current = { original: '', translation: '' }
  }
  async function startLiveSession() {
    if (!requireLogin() || liveStartRef.current || liveState === 'connecting') return
    if (!navigator.mediaDevices?.getUserMedia || !window.WebSocket || !window.AudioContext || !window.AudioWorkletNode) { setLiveState('error'); setLiveError('此浏览器不支持实时语音所需功能，请使用较新的浏览器后重试。'); return }
    liveStartRef.current = true; liveEndingRef.current = false; setLiveState('connecting'); setLiveError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${location.host}/api/volcengine/live`)
      const scenarioCode: Record<string, 'restaurant' | 'hotel' | 'transport' | 'everyday'> = { '餐厅': 'restaurant', '酒店': 'hotel', '交通': 'transport', '日常交流': 'everyday' }
      const timeout = window.setTimeout(() => { if (!liveStartRef.current) return; socket.close(); liveStartRef.current = false; setLiveState('error'); setLiveError('实时沟通连接超时，请检查网络后重试。') }, 15_000)
      liveStreamRef.current = stream; liveSocketRef.current = socket
      socket.onopen = () => socket.send(JSON.stringify({ type: 'start', direction: liveDirection, scenario: scenarioCode[liveScenario] ?? 'everyday' }))
      socket.onmessage = async event => {
        try {
          const message = JSON.parse(event.data) as { type?: string; text?: string; interim?: boolean; data?: string; message?: string }
          if (message.type === 'ready') {
            window.clearTimeout(timeout)
            const audioContext = new AudioContext()
            await audioContext.audioWorklet.addModule('/pcm-capture.worklet.js')
            const source = audioContext.createMediaStreamSource(stream)
            const worklet = new AudioWorkletNode(audioContext, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
            const sink = audioContext.createGain()
            sink.gain.value = 0
            worklet.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
              if (socket.readyState !== WebSocket.OPEN) return
              const bytes = new Uint8Array(data)
              let binary = ''
              for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
              socket.send(JSON.stringify({ type: 'audio', data: btoa(binary) }))
            }
            source.connect(worklet); worklet.connect(sink); sink.connect(audioContext.destination)
            await audioContext.resume()
            liveAudioContextRef.current = audioContext; liveAudioSourceRef.current = source; liveAudioWorkletRef.current = worklet; liveAudioSinkRef.current = sink
            setLiveState('connected'); liveStartRef.current = false
          }
          if (message.type === 'asr' && message.text) liveDraftRef.current.original = message.text
          if (message.type === 'translation' && message.text) liveDraftRef.current.translation += message.text
          if (message.type === 'audio' && message.data) { const binary = atob(message.data); liveAudioChunksRef.current.push(Uint8Array.from(binary, char => char.charCodeAt(0))) }
          if (message.type === 'audio-end' && liveAudioChunksRef.current.length) { const clip = new Blob(liveAudioChunksRef.current, { type: 'audio/ogg; codecs=opus' }); liveAudioChunksRef.current = []; const objectUrl = URL.createObjectURL(clip); const audio = new Audio(objectUrl); audio.onended = () => URL.revokeObjectURL(objectUrl); audio.muted = !liveAutoPlayRef.current; liveAudioRef.current = audio; if (liveAutoPlayRef.current) void audio.play().catch(() => setLiveError('译文语音已生成，但浏览器阻止了自动播放。请开启自动播放后重试。')) }
          if (message.type === 'turn-end') commitLiveTurn()
          if (message.type === 'error') { endLiveSession(false); setLiveState('error'); setLiveError(message.message || '实时沟通服务返回错误，请重新连接。') }
        } catch {
          endLiveSession(false)
          setLiveState('error')
          setLiveError('实时音频初始化失败，请刷新页面后重试。')
        }
      }
      socket.onerror = () => { window.clearTimeout(timeout); if (!liveEndingRef.current) { endLiveSession(false); setLiveState('error'); setLiveError('无法连接实时沟通服务，请检查网络后重试。') } }
      socket.onclose = () => { window.clearTimeout(timeout); if (!liveEndingRef.current) { endLiveSession(false); setLiveState('error'); setLiveError('实时沟通连接已关闭，请重新连接。') } }
    } catch { endLiveSession(false); setLiveState('error'); setLiveError('未获得麦克风权限。请在浏览器设置中允许麦克风后重试。') }
  }
  function toggleLivePause() {
    const paused = liveState === 'connected'
    liveStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !paused })
    setLiveState(paused ? 'paused' : 'connected')
  }
  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setActive('plan')} aria-label="英伦旅伴首页"><span className="brand-dot" />英伦旅伴</button>{authLoading ? <span className="auth-loading">登录状态…</span> : user ? <div className="account-menu"><span><UserRound size={16}/>{user.name || user.email || '已登录'}</span><button onClick={signOut}><LogOut size={16}/>退出</button></div> : <button className="login-entry" onClick={() => setShowLogin(true)}><ShieldCheck size={16}/>登录</button>}</header>
    <section className="hero"><div className="hero-copy"><p>为一家人的英国旅行准备</p><h1>{active === 'plan' ? '旅行行程' : active === 'guide' ? '景点导览' : active === 'translate' ? '图片翻译' : '沟通'}<span className="hero-mark" /></h1><span>从你的目的地与偏好出发，慢慢安排。</span></div>{selectedPlace ? <div className="weather-card"><CloudRain size={22}/><div><strong>{weather ? `${selectedPlace.displayName} · ${weather.label} · ${weather.temperature}°C` : weatherState === 'loading' ? '正在读取天气…' : '暂无天气数据'}</strong><small>{weather ? `体感 ${weather.apparent}°C · 数据时间 ${weather.observedAt}` : '天气仅在选择地点后尝试获取'}</small></div></div> : <div className="weather-card"><CloudRain size={22}/><div><strong>尚未选择地点</strong><small>选择真实地点后才会请求天气数据</small></div></div>}</section>
    {!user && !authLoading && <section className="signin-banner"><ShieldCheck size={19}/><div><b>登录后创建私密旅行记录</b><span>AI 结果、图片与导览只会在你完成登录后生成和保存。</span></div><button onClick={() => setShowLogin(true)}>去登录</button></section>}
    {notice && <div className="notice" role="status"><Sparkles size={15}/>{notice}<button onClick={() => setNotice('')} aria-label="关闭提示"><X size={14}/></button></div>}
    <section className="content-block source-form"><div className="section-head"><div><p>地点与天气</p><h2>选好目的地再出发</h2></div></div><div className="place-search"><input value={placeQuery} onChange={e => setPlaceQuery(e.target.value)} placeholder="输入英国城市、景点或地址" /><button className="btn btn-primary" onClick={searchPlaces} disabled={placeState === 'loading'}>{placeState === 'loading' ? '查询中…' : <><Search size={17}/>查询地点</>}</button></div><p className="data-note">地点坐标与地址：<a href={OSM_SOURCE} target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>。公开 Nominatim 服务有频率限制，请手动查询而非连续搜索。</p>{places.length > 0 && <div className="place-results">{places.map(place => <button className={selectedPlace?.osmUrl === place.osmUrl ? 'place-result selected' : 'place-result'} key={place.osmUrl} onClick={() => selectPlace(place)}><MapPin size={17}/><span>{place.displayName}</span><ExternalLink size={15}/></button>)}</div>}{placeState === 'error' && <p className="empty-state">地点服务当前不可用。请稍后手动重试。</p>}</section>
    {active === 'plan' && <section className="content-block"><div className="section-head"><div><p>旅行资料</p><h2>填写后再生成</h2></div></div><div className="trip-form"><label>这趟旅行的名称<input value={trip.title} onChange={e => setTrip({ ...trip, title: e.target.value })} placeholder="例如：暑假英国亲子行" /></label><label>抵达日期<input type="date" value={trip.arrivalDate} onChange={e => setTrip({ ...trip, arrivalDate: e.target.value })} /></label><label>离开日期<input type="date" value={trip.departureDate} onChange={e => setTrip({ ...trip, departureDate: e.target.value })} /></label><label>家庭组成<input value={trip.familySummary} onChange={e => setTrip({ ...trip, familySummary: e.target.value })} placeholder="例如：2位成人，1位7岁儿童" /></label><label>旅行偏好<input value={trip.preferences} onChange={e => setTrip({ ...trip, preferences: e.target.value })} placeholder="例如：亲子、节奏舒缓、减少换乘" /></label></div><button className="btn btn-primary" onClick={generateItinerary} disabled={itineraryState === 'loading'}>{itineraryState === 'loading' ? '正在生成…' : '生成我的行程'}</button>{itinerary && <article className="created-result"><b>你的新行程</b><p>{itinerary}</p><small>由你填写的信息、所选地点与可取得的天气数据生成。场馆闭馆、临时限制与票务余量未验证，请查看官方公告。</small></article>}{itineraryState === 'error' && <p className="empty-state">没有生成任何行程。请完善信息后重试。</p>}</section>}
    {active === 'guide' && <section className="content-block"><div className="section-head"><div><p>景点小档案</p><h2>选点后了解更多</h2></div></div>{!selectedPlace ? <p className="empty-state">先在“行程”中查询并选择目的地，再查看景点资料。</p> : <><button className="btn btn-primary" onClick={loadGuideSource} disabled={guideState === 'loading'}>{guideState === 'loading' ? '读取资料中…' : '查看景点资料'}</button>{guideSource && <article className="source-card"><b>{guideSource.name}</b><p>{guideSource.excerpt}</p><a href={guideSource.url} target="_blank" rel="noreferrer">查看来源：Wikipedia <ExternalLink size={14}/></a><button className="btn btn-outline" onClick={generateGuide} disabled={guideState === 'loading'}>基于此资料生成中文导览</button></article>}{guideText && <article className="created-result"><b>AI 生成的中文导览</b><p>{guideText}</p><small>此导览是基于上方公开资料的生成性解读，可能包含不确定之处；请以来源页面为准。</small><button className="play-button" onClick={generateAudio} disabled={audioState === 'loading'}>{audioState === 'loading' ? '生成语音中…' : <><Play size={17} fill="currentColor"/>从此导览生成语音</>}</button></article>}{audioUrl && <audio className="audio-player" controls src={audioUrl}>你的浏览器暂不支持音频播放。</audio>}{guideState === 'error' && <div className="empty-state"><p>景点资料暂时未能取得。请稍后重试。</p><button className="text-button" onClick={loadGuideSource}>重试查询</button><span>也可以返回“行程”页，用更具体的景点名称重新查询。</span></div>}</>}</section>}
    {active === 'translate' && <section className="content-block translator"><div className="section-head"><div><p>用户上传的图片</p><h2>上传后才翻译</h2></div><span className="small-tag">不展示演示翻译</span></div><input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={e => handleImage(e.target.files?.[0])} hidden /><button className="capture-zone" onClick={() => { if (requireLogin()) fileRef.current?.click() }} disabled={translateState === 'loading'}>{imagePreview ? <img src={imagePreview} alt="你选择的待翻译图片"/> : <><Camera size={34}/><b>拍照或上传英文信息</b><span>仅在你选择图片后上传并调用翻译</span></>}{translateState === 'loading' && <i>翻译中…</i>}</button>{translation && <article className="translation-result"><div className="annotated-label">你的翻译结果</div><p>{translation}</p><small>结果来自你上传的图片。若服务支持，将在记录中保存标注图。</small></article>}{translateState === 'error' && <p className="empty-state">没有生成翻译结果。请重新选择图片后重试。</p>}</section>}
    {active === 'voice' && <section className="content-block voice-chat"><div className="section-head"><div><p>面对面沟通</p><h2>实时沟通</h2></div><Languages size={22}/></div><p className="voice-intro">快速完成“录一段—翻译—播放”的对话回合，不会后台录音，也不是逐字同传。</p><div className="voice-direction"><button className={voiceDirection === 'zh-en' ? 'selected' : ''} onClick={() => setVoiceDirection('zh-en')}>我说中文</button><button className={voiceDirection === 'en-zh' ? 'selected' : ''} onClick={() => setVoiceDirection('en-zh')}>对方说英文</button></div><div className="voice-scenarios"><span>餐厅</span><span>酒店</span><span>交通</span></div><button className={`voice-record ${voiceState === 'recording' ? 'recording' : ''}`} onClick={voiceState === 'recording' ? stopVoiceTurn : startVoiceTurn} disabled={voiceState === 'processing'}>{voiceState === 'recording' ? <><Mic size={28}/>结束录音</> : voiceState === 'processing' ? <>正在翻译…</> : <><Mic size={28}/>开始说话</>}</button><p className="voice-privacy">仅处理你主动录制的这一段语音。录音不会保存；本次对话文字仅保留在当前页面。</p>{voiceError && <div className="empty-state"><p>{voiceError}</p><button className="text-button" onClick={() => { setVoiceError(''); if (voiceState === 'error') setVoiceState('idle') }}><RotateCcw size={14}/>重新尝试</button></div>}<div className="voice-turns">{voiceTurns.length === 0 ? <p className="empty-state">录制第一句话后，会在这里显示中英双语内容。</p> : voiceTurns.map(turn => <article className="voice-turn" key={turn.id}><small>{turn.direction === 'zh-en' ? '中文 → English' : 'English → 中文'}</small><p>{turn.original}</p><strong>{turn.translation}</strong><button className="play-button" onClick={() => playVoiceTurn(turn.audioUrl)}><Play size={16} fill="currentColor"/>播放译文</button></article>)}</div></section>}
    {active === 'live' && <section className="content-block live-chat"><div className="section-head"><div><p>连续双语对话</p><h2>实时翻译</h2></div><span className={`live-state ${liveState}`}>{liveState === 'connected' ? '已连接' : liveState === 'connecting' ? '正在连接' : liveState === 'paused' ? '已暂停' : '未开始'}</span></div><p className="voice-intro">开始后才会使用麦克风。系统会把你说的中文翻译成英文并播放给对方听；结束会话即停止收音并清空临时文字。</p><div className="live-scenarios">{['餐厅', '酒店', '交通', '日常交流'].map(scenario => <button key={scenario} className={liveScenario === scenario ? 'selected' : ''} onClick={() => setLiveScenario(scenario)} disabled={liveState === 'connected' || liveState === 'paused'}>{scenario}</button>)}</div><label className="autoplay-control"><input type="checkbox" checked={liveAutoPlay} onChange={event => { setLiveAutoPlay(event.target.checked); if (liveAudioRef.current) liveAudioRef.current.muted = !event.target.checked }} />自动播放英文语音</label><div className="live-controls">{liveState === 'idle' || liveState === 'error' ? <button className="btn btn-primary" onClick={startLiveSession}>{liveState === 'error' ? '重新连接' : '开始 Live 翻译'}</button> : <><button className="btn btn-outline" onClick={toggleLivePause}>{liveState === 'paused' ? '继续收音' : '暂停收音'}</button><button className="btn btn-primary" onClick={() => endLiveSession()}>结束会话</button></>}</div><p className="voice-privacy">不保存原始音频，也不会在后台监听。本次会话的临时文字会在结束时清空。</p>{liveError && <div className="empty-state"><p>{liveError}</p><span>请检查网络后重新连接。</span></div>}<div className="live-turns">{liveTurns.length === 0 ? <p className="empty-state">开始说中文后，中英文内容会在这里出现。</p> : liveTurns.map(turn => <article className="voice-turn" key={turn.id}><small>中文 → English</small><p>{turn.original}</p><strong>{turn.translation}</strong></article>)}</div></section>}
    <nav className="bottom-nav" aria-label="主导航"><button className={active === 'plan' ? 'selected' : ''} onClick={() => setActive('plan')}><Compass size={19}/>行程</button><button className={active === 'guide' ? 'selected' : ''} onClick={() => setActive('guide')}><MapPin size={19}/>导览</button><button className={active === 'translate' ? 'selected' : ''} onClick={() => setActive('translate')}><ImagePlus size={19}/>翻译</button><button className={active === 'live' ? 'selected' : ''} onClick={() => setActive('live')}><Languages size={19}/>沟通</button></nav>
    {showLogin && <div className="modal-backdrop" role="presentation"><section className="login-dialog" role="dialog" aria-modal="true" aria-label="登录英伦旅伴"><button className="modal-close" onClick={() => setShowLogin(false)} aria-label="关闭"><X/></button><div className="login-mark"><ShieldCheck size={27}/></div><p>英伦旅伴 · 私密旅行档案</p><h2>登录后继续</h2><span>使用 HowOne 账户登录。你的行程、导览和翻译记录仅属于你。</span>{loginStep === 'identity' ? <><div className="auth-methods"><button className={authMethod === 'phone' ? 'selected' : ''} onClick={() => { setAuthMethod('phone'); setLoginError('') }}>手机号登录</button><button className={authMethod === 'email' ? 'selected' : ''} onClick={() => { setAuthMethod('email'); setLoginError('') }}>邮箱登录</button></div>{authMethod === 'phone' ? <label>手机号<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+447700900123" autoComplete="tel" /></label> : <label>邮箱地址<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" /></label>}<button className="btn btn-primary" onClick={sendCode} disabled={loginBusy}>{loginBusy ? '发送中…' : '发送验证码'}</button></> : <><label>{authMethod === 'phone' ? '手机验证码' : '邮箱验证码'}<input inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} placeholder="输入收到的验证码" autoComplete="one-time-code" /></label><button className="btn btn-primary" onClick={completeLogin} disabled={loginBusy}>{loginBusy ? '登录中…' : '验证并登录'}</button><button className="text-button" onClick={() => setLoginStep('identity')}>更换登录方式</button></>}{loginError && <div className="login-error">{loginError}</div>}</section></div>}
    <footer className="footer-statement">走慢一点，英国会更清楚。<span>天气：<a href={WEATHER_SOURCE} target="_blank" rel="noreferrer">Open-Meteo</a> · 地点：<a href={OSM_SOURCE} target="_blank" rel="noreferrer">OpenStreetMap</a></span></footer>
  </main>
}
export default App
