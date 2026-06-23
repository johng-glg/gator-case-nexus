import type { ComponentType } from 'react'
import { template as caseStatusUpdate } from './case-status-update'
import { template as ssdiWelcomePacket } from './ssdi-welcome-packet'
import { template as ssdiIntakeQuestionnaire } from './ssdi-intake-questionnaire'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'case-status-update': caseStatusUpdate,
  'ssdi-welcome-packet': ssdiWelcomePacket,
  'ssdi-intake-questionnaire': ssdiIntakeQuestionnaire,
}
