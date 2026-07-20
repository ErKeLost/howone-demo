import {
  createClient,
  defineAiAction,
  defineAiActions,
  defineEntities,
  type EntityRecord,
  withAiActions,
  withEntities,
} from '@howone/sdk'
import { z } from 'zod'

export type TripRecord = EntityRecord & { title: string; arrivalDate: string; departureDate: string; destinations: string[]; familySummary: string; preferences: string }
export type TripCreate = { title: string; arrivalDate: string; departureDate: string; destinations: string[]; familySummary: string; preferences: string }
export type TripUpdate = Partial<TripCreate>
export type ItineraryDayRecord = EntityRecord & { tripId: string; dayNumber: number; title: string; planContent: string; status: 'draft' | 'ready' | 'adjusted'; weatherSummary?: string | null; alternativeTitle?: string | null; alternativeReason?: string | null }
export type ItineraryDayCreate = { tripId: string; dayNumber: number; title: string; planContent: string; status?: 'draft' | 'ready' | 'adjusted'; weatherSummary?: string | null; alternativeTitle?: string | null; alternativeReason?: string | null }
export type ItineraryDayUpdate = Partial<ItineraryDayCreate>
export type AttractionGuideRecord = EntityRecord & { attractionName: string; guideText: string; audioUrl?: string | null; locationLabel?: string | null; sourceUrl?: string | null; sourceName?: string | null; sourceExcerpt?: string | null }
export type AttractionGuideCreate = { attractionName: string; guideText: string; audioUrl?: string | null; locationLabel?: string | null; sourceUrl?: string | null; sourceName?: string | null; sourceExcerpt?: string | null }
export type AttractionGuideUpdate = Partial<AttractionGuideCreate>
export type TranslationHistoryRecord = EntityRecord & { sourceImageUrl: string; sourceLabel: string; translatedText: string; annotatedImageUrl?: string | null; translationContext?: string | null }
export type TranslationHistoryCreate = { sourceImageUrl: string; sourceLabel: string; translatedText: string; annotatedImageUrl?: string | null; translationContext?: string | null }
export type TranslationHistoryUpdate = Partial<TranslationHistoryCreate>

export const generateFamilyItineraryInputSchema = z.object({ trip_brief: z.string(), weather_context: z.string().optional(), language: z.string().optional() })
export const generateFamilyItineraryOutputSchema = z.object({ itinerary_plan: z.string() })
export const translateTravelImageInputSchema = z.object({ source_image_url: z.string().url(), translation_context: z.string().optional(), target_language: z.string().optional() })
export const translateTravelImageOutputSchema = z.object({ translated_text: z.string(), annotated_image_url: z.string().url().optional() })
export const generateAttractionGuideInputSchema = z.object({ attraction_name: z.string(), visitor_context: z.string().optional(), guide_language: z.string().optional() })
export const generateAttractionGuideOutputSchema = z.object({ guide_text: z.string() })
export const generateChineseAudioGuideInputSchema = z.object({ guide_script: z.string(), audio_language: z.string().optional(), voice_hint: z.string().optional() })
export const generateChineseAudioGuideOutputSchema = z.object({ audio_url: z.string().url() })

const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
  auth: 'custom',
  loginPath: '/',
})
export const entities = defineEntities({
  Trip: client.entity<TripRecord, TripCreate, TripUpdate>('Trip'),
  ItineraryDay: client.entity<ItineraryDayRecord, ItineraryDayCreate, ItineraryDayUpdate>('ItineraryDay'),
  AttractionGuide: client.entity<AttractionGuideRecord, AttractionGuideCreate, AttractionGuideUpdate>('AttractionGuide'),
  TranslationHistory: client.entity<TranslationHistoryRecord, TranslationHistoryCreate, TranslationHistoryUpdate>('TranslationHistory'),
})
export const ai = defineAiActions({
  generateFamilyItinerary: defineAiAction('generateFamilyItinerary', { workflowId: '669a7d6e-5054-4af4-9d25-25b0c052d2e8', inputSchema: generateFamilyItineraryInputSchema, outputSchema: generateFamilyItineraryOutputSchema }),
  translateTravelImage: defineAiAction('translateTravelImage', { workflowId: 'ccffbf75-be24-4c79-bd52-3f846ab8ec2b', inputSchema: translateTravelImageInputSchema, outputSchema: translateTravelImageOutputSchema }),
  generateAttractionGuide: defineAiAction('generateAttractionGuide', { workflowId: '1e9e395a-5d0f-4b6f-af83-329fd88f286f', inputSchema: generateAttractionGuideInputSchema, outputSchema: generateAttractionGuideOutputSchema }),
  generateChineseAudioGuide: defineAiAction('generateChineseAudioGuide', { workflowId: '8d8b1379-85d6-462b-ab76-46e0b861c621', inputSchema: generateChineseAudioGuideInputSchema, outputSchema: generateChineseAudioGuideOutputSchema }),
})

const howone = withAiActions(withEntities(client, entities), ai)
export default howone
