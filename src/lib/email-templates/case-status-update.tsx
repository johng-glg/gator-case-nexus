import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'

interface CaseStatusUpdateProps {
  firstName?: string
  caseLabel?: string
  subjectLine?: string
  bodyText?: string
  ctaLabel?: string
  ctaUrl?: string
  siteName?: string
}

const CaseStatusUpdateEmail = ({
  firstName,
  caseLabel,
  bodyText,
  ctaLabel,
  ctaUrl,
  siteName = 'Gator Law',
}: CaseStatusUpdateProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>An update on your case from {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{siteName}</Text>
        </Section>
        <Heading style={h1}>An update on your case</Heading>
        {caseLabel ? <Text style={meta}>Case {caseLabel}</Text> : null}
        <Text style={text}>
          {firstName ? `Hi ${firstName},` : 'Hi there,'}
        </Text>
        <Text style={text}>
          {bodyText ||
            'There has been an update on your case. Please sign in to the client portal for details.'}
        </Text>
        {ctaUrl ? (
          <Section style={{ margin: '28px 0 32px' }}>
            <Button style={button} href={ctaUrl}>
              {ctaLabel || 'View your case'}
            </Button>
          </Section>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>
          This message was sent by {siteName}. If you have questions, reply to this
          email or call the firm directly. To stop receiving case-update emails, use
          the unsubscribe link below.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CaseStatusUpdateEmail,
  subject: (data: Record<string, any>) =>
    (data?.subjectLine as string | undefined) || 'An update on your case',
  displayName: 'Case status update',
  previewData: {
    firstName: 'Jane',
    caseLabel: 'SSDI-1042',
    subjectLine: 'Your SSDI application has been filed — SSDI-1042',
    bodyText:
      'Good news — your application has been filed with the Social Security Administration. SSA reviews can take several months. We will keep you posted whenever the status changes.',
    ctaLabel: 'View your case',
    ctaUrl: 'https://gator-case-nexus.lovable.app/portal',
    siteName: 'Gator Law',
  },
} satisfies TemplateEntry

export default CaseStatusUpdateEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const header = { marginBottom: '24px' }
const brand = {
  fontSize: '12px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: '#0b3d2e',
  fontWeight: 600 as const,
  margin: 0,
}
const h1 = {
  fontFamily: 'Playfair Display, Georgia, serif',
  fontSize: '26px',
  fontWeight: 600 as const,
  color: '#111827',
  margin: '0 0 6px',
}
const meta = {
  fontSize: '12px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#6b7280',
  margin: '0 0 24px',
}
const text = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const button = {
  backgroundColor: '#0b3d2e',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600 as const,
  borderRadius: '8px',
  padding: '12px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e5e7eb', margin: '32px 0 20px' }
const footer = { fontSize: '12px', color: '#6b7280', lineHeight: '1.5', margin: 0 }
