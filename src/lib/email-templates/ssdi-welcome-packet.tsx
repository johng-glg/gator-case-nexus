import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string | null
  attorneyName?: string | null
  attorneyEmail?: string | null
  portalUrl?: string | null
}

const Email = ({ firstName, attorneyName, attorneyEmail, portalUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Gator Law — what happens next on your Social Security disability case</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Gator Law</Heading>
        <Text style={text}>
          {firstName ? `Hi ${firstName},` : 'Hello,'} we&rsquo;ve received your signed
          retainer and our team is now officially representing you on your
          Social Security disability claim. This email walks you through what
          to expect, and — just as important — the things you can do that
          decide cases.
        </Text>

        <Heading style={h2}>What happens next</Heading>
        <Text style={text}>
          Our office will file (or finish) your application with the Social
          Security Administration and begin gathering the medical evidence
          your claim depends on. You&rsquo;ll get updates from us as the case
          moves through each step.
        </Text>

        <Heading style={h2}>Realistic timeline</Heading>
        <Text style={text}>
          Initial decisions typically take <strong>6&ndash;12 months</strong>.
          If we have to appeal, reconsideration adds several more months and a
          full hearing in front of an Administrative Law Judge can take
          <strong>&nbsp;1&ndash;2 years</strong> from filing. We know that is
          a long time — we will be working the case throughout.
        </Text>

        <Heading style={h2}>What you can do — these decide the case</Heading>
        <Section style={callout}>
          <Text style={listItem}>
            <strong>Keep seeing your doctors.</strong> Gaps in treatment are
            the single most common reason claims get denied. Follow your
            doctors&rsquo; instructions.
          </Text>
          <Text style={listItem}>
            <strong>Do not work above the SGA limit.</strong> Earning above
            Social Security&rsquo;s &ldquo;substantial gainful activity&rdquo;
            level (currently around $1,620/month for non-blind claimants) can
            disqualify you. Call us before starting any work.
          </Text>
          <Text style={listItem}>
            <strong>Keep a list of every provider you see.</strong> Names,
            addresses, dates — anyone who treats you for your condition.
            Add new providers to your portal as you go.
          </Text>
          <Text style={listItem}>
            <strong>Tell us immediately about any SSA letter.</strong>{' '}
            Forward or photograph anything you receive from Social Security
            the same day. Appeal deadlines are short and unforgiving.
          </Text>
          <Text style={listItem}>
            <strong>Use the portal.</strong> Upload IDs, medical records, and
            anything SSA sends you through your secure portal — that&rsquo;s
            the fastest way for us to get it.
          </Text>
        </Section>

        {portalUrl && (
          <Text style={text}>
            Your portal: <Link href={portalUrl} style={link}>{portalUrl}</Link>
          </Text>
        )}

        <Hr style={hr} />
        <Text style={signoff}>
          {attorneyName ? <>Your attorney: <strong>{attorneyName}</strong></> : 'Your Gator Law team'}
          {attorneyEmail ? <> &middot; <Link href={`mailto:${attorneyEmail}`} style={link}>{attorneyEmail}</Link></> : null}
        </Text>
        <Text style={footer}>
          Gator Law — Social Security Disability advocates. This is not legal
          advice for any specific situation; we&rsquo;ll communicate
          case-specific guidance directly.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Welcome to Gator Law — your Social Security disability case',
  displayName: 'SSDI welcome packet',
  previewData: {
    firstName: 'Alex',
    attorneyName: 'Maya Chen',
    attorneyEmail: 'maya@gatorlawpc.com',
    portalUrl: 'https://gator-case-nexus.lovable.app/portal',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0b3d2e', margin: '0 0 16px' }
const h2 = { fontSize: '15px', fontWeight: 'bold' as const, color: '#0b3d2e', margin: '24px 0 8px' }
const text = { fontSize: '14px', color: '#2a2a2a', lineHeight: '1.55', margin: '0 0 14px' }
const callout = { backgroundColor: '#f4f7f5', borderLeft: '3px solid #0b3d2e', padding: '12px 16px', borderRadius: '4px', margin: '8px 0 16px' }
const listItem = { fontSize: '14px', color: '#2a2a2a', lineHeight: '1.55', margin: '0 0 10px' }
const link = { color: '#0b3d2e', textDecoration: 'underline' }
const hr = { borderColor: '#e6e6e6', margin: '24px 0' }
const signoff = { fontSize: '13px', color: '#2a2a2a', margin: '0 0 8px' }
const footer = { fontSize: '11px', color: '#888', margin: '8px 0 0' }
