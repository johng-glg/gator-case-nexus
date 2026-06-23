import * as React from 'react'

import {
  Body,
  Button,
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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

// Gator Law SSDI — Client portal welcome (used by autoInvitePortal at lead conversion).
// Passwordless: one-tap link signs the client into /portal — no password to set, no account to create.
export const InviteEmail = ({
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => {
  const portalUrl = `${siteUrl.replace(/\/$/, '')}/client-auth`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your secure case portal is ready — sign in with one tap</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>GATOR LAW</Text>
          <Heading style={h1}>Welcome to your case portal</Heading>
          <Text style={text}>
            Your attorney at Gator Law set up a secure portal where you can review
            documents, sign forms, message your team, and track your Social Security
            Disability case.
          </Text>
          <Text style={text}>
            No password needed — just tap the button below to sign in.
          </Text>
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button style={button} href={confirmationUrl}>
              Open my portal
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={smallHeading}>Coming back later?</Text>
          <Text style={text}>
            Bookmark this address — anytime you visit, enter your email and we'll send
            a fresh one-tap sign-in link:
            <br />
            <Link href={portalUrl} style={link}>
              {portalUrl}
            </Link>
          </Text>
          <Text style={footer}>
            If you didn't expect this email, you can safely ignore it — nothing will
            happen. Questions? Reply to this email and we'll get back to you.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default InviteEmail

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
const smallHeading = {
  fontSize: '13px',
  fontWeight: 'bold' as const,
  color: FOREST,
  letterSpacing: '0.05em',
  margin: '0 0 6px',
  textTransform: 'uppercase' as const,
}
const link = { color: FOREST, textDecoration: 'underline' }
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
const hr = { border: 'none', borderTop: '1px solid #e6e6e0', margin: '28px 0 20px' }
const footer = { fontSize: '12px', color: '#888888', lineHeight: '1.5', margin: '28px 0 0' }
