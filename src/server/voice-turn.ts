import { Buffer } from 'node:buffer'

type Direction = 'zh-en' | 'en-zh'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function openaiError(response: Response) {
  const message = await response.text().catch(() => '')
  return json({ error: '语音服务暂时不可用，请稍后重试。', detail: message.slice(0, 200) }, response.status)
}

export async function handleVoiceTurn(request: Request) {
  if (request.method !== 'POST') return json({ error: '仅支持 POST 请求。' }, 405)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: '语音服务尚未就绪，请稍后再试。' }, 503)

  try {
    const form = await request.formData()
    const audio = form.get('audio')
    const direction = form.get('direction')
    const context = String(form.get('context') ?? '').slice(0, 1600)
    if (!(audio instanceof File) || !audio.size) return json({ error: '没有收到录音，请重新录制。' }, 400)
    if (direction !== 'zh-en' && direction !== 'en-zh') return json({ error: '翻译方向无效。' }, 400)

    const transcriptionForm = new FormData()
    transcriptionForm.set('file', audio, audio.name || 'turn.webm')
    transcriptionForm.set('model', 'gpt-4o-transcribe')
    transcriptionForm.set('response_format', 'json')
    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: transcriptionForm,
    })
    if (!transcriptionResponse.ok) return openaiError(transcriptionResponse)
    const transcription = await transcriptionResponse.json() as { text?: string }
    const original = transcription.text?.trim()
    if (!original) return json({ error: '没有识别到清晰语音，请靠近麦克风后重试。' }, 422)

    const targetLanguage = direction === 'zh-en' ? 'English' : 'Simplified Chinese'
    const sourceLanguage = direction === 'zh-en' ? 'Chinese' : 'English'
    const translateResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        instructions: `You translate a ${sourceLanguage}-English travel conversation into ${targetLanguage}. Return only the natural translation, no labels, notes, or quotation marks. Keep names, prices, and numbers accurate. Recent conversation for context only: ${context || 'None'}`,
        input: original,
      }),
    })
    if (!translateResponse.ok) return openaiError(translateResponse)
    const translationData = await translateResponse.json() as { output_text?: string }
    const translation = translationData.output_text?.trim()
    if (!translation) return json({ error: '暂时无法生成译文，请重试。' }, 502)

    const speechResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: translation, response_format: 'mp3' }),
    })
    if (!speechResponse.ok) return openaiError(speechResponse)
    const audioBase64 = Buffer.from(await speechResponse.arrayBuffer()).toString('base64')
    return json({ original, translation, audioBase64, audioMimeType: 'audio/mpeg' })
  } catch {
    return json({ error: '网络连接出现问题，请检查网络后重试。' }, 502)
  }
}
