import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

// Gator Law — returning client sign-in link.
export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your one-tap sign-in link for your Gator Law portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>GATOR LAW</Text>
        <Heading style={h1}>Your sign-in link</Heading>
        <Text style={text}>
          Tap below to sign in to your client portal. For your security, this link
          works only once and expires shortly.
        </Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={confirmationUrl}>
            Sign in to my portal
          </Button>
        </Section>
        <Text style={footer}>
          Didn't request this? You can safely ignore this email — no one can access
          your portal without clicking the link above from your inbox.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const FOREST = '#1f4d36'

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const brand = {
  fontSize: '11px',
  letterSpacing: '0.22em',
  color: FOREST,
  fontWeight: 'bold' as const,
  margin: '0 0 14px',
}
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: FOREST,
  margin: '0 0 18px',
  lineHeight: '1.2',
}
const text = {
  fontSize: '15px',
  color: '#3a3a3a',
  lineHeight: '1.55',
  margin: '0 0 16px',
}
const button = {
  backgroundColor: FOREST,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#888888', lineHeight: '1.5', margin: '28px 0 0' }
