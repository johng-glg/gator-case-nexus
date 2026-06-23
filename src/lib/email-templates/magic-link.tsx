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
  /** 6-digit OTP — paired with the link so accessibility/link-mangling never blocks sign-in. */
  token?: string
}

// Gator Law — returning client sign-in. Sends BOTH a one-tap link AND a 6-digit
// code in the same email; clients can use whichever works for them.
export const MagicLinkEmail = ({ confirmationUrl, token }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your one-tap sign-in link (or 6-digit code) for your Gator Law portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>GATOR LAW</Text>
        <Heading style={h1}>Sign in to your portal</Heading>
        <Text style={text}>
          Either tap the button below or type the 6-digit code into the sign-in page.
          For your security, both expire shortly and work only once.
        </Text>
        <Section style={{ textAlign: 'center', margin: '24px 0 16px' }}>
          <Button style={button} href={confirmationUrl}>
            Sign in to my portal
          </Button>
        </Section>
        {token ? (
          <Section style={{ textAlign: 'center', margin: '8px 0 24px' }}>
            <Text style={codeLabel}>Or enter this code:</Text>
            <Text style={codeBox}>{token}</Text>
          </Section>
        ) : null}
        <Text style={footer}>
          Didn't request this? You can safely ignore this email — no one can access
          your portal without the link or code above.
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
const codeLabel = {
  fontSize: '13px',
  color: '#6a6a6a',
  margin: '0 0 6px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
}
const codeBox = {
  fontSize: '32px',
  fontWeight: 'bold' as const,
  color: FOREST,
  letterSpacing: '0.4em',
  fontFamily: 'monospace',
  margin: '0',
}
const footer = {
  fontSize: '12px',
  color: '#888888',
  lineHeight: '1.5',
  margin: '28px 0 0',
}
