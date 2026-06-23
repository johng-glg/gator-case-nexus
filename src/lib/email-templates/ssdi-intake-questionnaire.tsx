import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string | null
  questionnaireUrl: string
}

const Email = ({ firstName, questionnaireUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>One short intake questionnaire — it speeds your case along</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>A short intake questionnaire</Heading>
        <Text style={text}>
          {firstName ? `Hi ${firstName},` : 'Hello,'} so we can build the strongest
          possible case for you, please fill out a short intake questionnaire
          in your secure portal. It covers:
        </Text>
        <Text style={listItem}>&bull; Your disability and onset history</Text>
        <Text style={listItem}>&bull; Recent work history</Text>
        <Text style={listItem}>&bull; Current medications</Text>
        <Text style={listItem}>&bull; Every medical provider treating you</Text>
        <Text style={text}>
          The list of providers is especially important — every one you list
          becomes a record request we send out on your behalf.
        </Text>
        <Button style={button} href={questionnaireUrl}>
          Open the questionnaire
        </Button>
        <Text style={smallText}>
          Or paste this link into your browser:{' '}
          <Link href={questionnaireUrl} style={link}>{questionnaireUrl}</Link>
        </Text>
        <Text style={footer}>
          Gator Law — Social Security Disability advocates.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your Gator Law intake questionnaire',
  displayName: 'SSDI intake questionnaire',
  previewData: {
    firstName: 'Alex',
    questionnaireUrl: 'https://gator-case-nexus.lovable.app/portal/intake',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b3d2e', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#2a2a2a', lineHeight: '1.55', margin: '0 0 14px' }
const listItem = { fontSize: '14px', color: '#2a2a2a', lineHeight: '1.55', margin: '0 0 6px' }
const button = {
  backgroundColor: '#0b3d2e',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '6px',
  padding: '12px 22px',
  textDecoration: 'none',
  display: 'inline-block',
  marginTop: '8px',
}
const smallText = { fontSize: '12px', color: '#666', margin: '16px 0 0', wordBreak: 'break-all' as const }
const link = { color: '#0b3d2e', textDecoration: 'underline' }
const footer = { fontSize: '11px', color: '#888', margin: '24px 0 0' }
