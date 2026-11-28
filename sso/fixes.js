// Where to fix each problem in the three most common identity providers.
// Paths follow each admin console's current menu names.

export const IDPS = { entra: 'Microsoft Entra ID', okta: 'Okta', google: 'Google Workspace' };

const ENTRA_APP = 'Entra admin center → Enterprise applications → your app';
const OKTA_APP = 'Okta Admin Console → Applications → Applications → your app';
const GOOGLE_APP = 'Google Admin console → Apps → Web and mobile apps → your app';

const RULES = [
  {
    re: /Audience does not match|SPNameQualifier is not your SP|No AudienceRestriction/,
    entra: `${ENTRA_APP} → Single sign-on → Basic SAML Configuration → Edit. Set Identifier (Entity ID) to your SP entity ID, exactly.`,
    okta: `${OKTA_APP} → General → SAML Settings → Edit → Configure SAML. Set Audience URI (SP Entity ID) to your SP entity ID.`,
    google: `${GOOGLE_APP} → Service provider details. Set Entity ID to your SP entity ID.`,
  },
  {
    re: /Recipient does not match|Destination does not match|no Destination|AssertionConsumerServiceURL is not your ACS/,
    entra: `${ENTRA_APP} → Single sign-on → Basic SAML Configuration → Edit. Add your ACS URL under Reply URL (Assertion Consumer Service URL) and mark it Default.`,
    okta: `${OKTA_APP} → General → SAML Settings → Edit. Set Single sign-on URL to your ACS URL and tick "Use this for Recipient URL and Destination URL".`,
    google: `${GOOGLE_APP} → Service provider details. Set ACS URL to your ACS URL.`,
  },
  {
    re: /Issuer does not match your IdP|issuers differ/,
    entra: `${ENTRA_APP} → Single sign-on → "Set up your app" section. Copy the Microsoft Entra Identifier (https://sts.windows.net/<tenant-id>/) into your app as the IdP entity ID.`,
    okta: `${OKTA_APP} → Sign On → View SAML setup instructions. Copy Identity Provider Issuer into your app.`,
    google: 'Google Admin console → Security → Authentication → SSO with Google as SAML IdP. Copy Entity ID into your app.',
  },
  {
    re: /Issuer does not match your SP entity ID/,
    entra: `${ENTRA_APP} → Single sign-on → Basic SAML Configuration. The Identifier there must equal the Issuer your app sends (AADSTS700016 means no app has it).`,
    okta: `${OKTA_APP} → General → SAML Settings. Audience URI must equal the Issuer your app sends.`,
    google: `${GOOGLE_APP} → Service provider details. Entity ID must equal the Issuer your app sends.`,
  },
  {
    re: /not the one you trust|signature value is wrong for this certificate|differs from the one you pasted|signing certificate expire/,
    entra: `${ENTRA_APP} → Single sign-on → SAML Certificates. Download Certificate (Base64) or the Federation Metadata XML and load it into your app. When rotating, add the new certificate, update your app, then Make certificate active.`,
    okta: `${OKTA_APP} → Sign On → SAML Signing Certificates. Download the Active certificate (Actions → Download certificate) and load it into your app. To rotate, Generate new certificate, update your app, then Activate.`,
    google: 'Google Admin console → Security → Authentication → SSO with Google as SAML IdP. Download the certificate or the IdP metadata, and add a new certificate there when rotating.',
  },
  {
    re: /uses SHA-1/,
    entra: `${ENTRA_APP} → Single sign-on → SAML Certificates → Edit. Set Signing Algorithm to SHA-256.`,
    okta: `${OKTA_APP} → General → SAML Settings → Edit → Show Advanced Settings. Set Signature Algorithm to RSA-SHA256 (and Digest Algorithm to SHA256).`,
    google: 'Google signs with SHA-256 already. If you see SHA-1, the message did not come from Google.',
  },
  {
    re: /Only the response is signed|not covered by a valid signature|Nothing in this message is signed|outer response is not signed/,
    entra: `${ENTRA_APP} → Single sign-on → SAML Certificates → Edit. Set Signing Option to "Sign SAML response and assertion".`,
    okta: `${OKTA_APP} → General → SAML Settings → Edit → Show Advanced Settings. Set Response and Assertion Signature to Signed.`,
    google: `${GOOGLE_APP} → Service provider details. Google always signs the assertion; tick "Signed response" to sign the whole response too.`,
  },
  {
    re: /Missing required attribute|Required attribute .* has no value|Attribute .* is empty|appears twice/,
    entra: `${ENTRA_APP} → Single sign-on → Attributes & Claims → Edit → Add new claim. Use the name your app expects (clear the Namespace box to get a short name like "email"). Empty values mean the user’s profile lacks that field.`,
    okta: `${OKTA_APP} → General → SAML Settings → Edit → Attribute Statements. Add the name your app expects and map it, for example user.email.`,
    google: `${GOOGLE_APP} → SAML attribute mapping. Add a mapping from a Google Directory field to the name your app expects.`,
  },
  {
    re: /NameID is transient|NameID format says email|No NameID|NameID is empty/,
    entra: `${ENTRA_APP} → Single sign-on → Attributes & Claims → Unique User Identifier (Name ID). Choose the Name identifier format (for example Email address or Persistent) and the Source attribute.`,
    okta: `${OKTA_APP} → General → SAML Settings → Edit. Set Name ID format (EmailAddress, Persistent) and Application username.`,
    google: `${GOOGLE_APP} → Service provider details. Set Name ID format and Name ID (for example Basic Information → Primary email).`,
  },
  {
    re: /RequestDenied|not assigned|UnknownPrincipal/,
    entra: `${ENTRA_APP} → Users and groups → Add user/group. Or under Properties set "Assignment required?" to No.`,
    okta: `${OKTA_APP} → Assignments → Assign. Assign the user or one of their groups.`,
    google: `${GOOGLE_APP} → User access. Turn the app ON for the user’s organizational unit or group.`,
  },
  {
    re: /InvalidNameIDPolicy/,
    entra: `${ENTRA_APP} → Single sign-on → Attributes & Claims → Unique User Identifier. Pick the format your app requests, or change NameIDPolicy in your app.`,
    okta: `${OKTA_APP} → General → SAML Settings. Set Name ID format to the one your app requests.`,
    google: `${GOOGLE_APP} → Service provider details. Set Name ID format to the one your app requests.`,
  },
  {
    re: /NoAuthnContext|Requires sign-in by/,
    entra: 'Remove RequestedAuthnContext from your AuthnRequest, or use Comparison="minimum". Entra ID answers AADSTS75011 when the user signed in another way.',
    okta: 'Remove RequestedAuthnContext from your AuthnRequest, or ask for PasswordProtectedTransport with Comparison="minimum".',
    google: 'Google ignores most authentication context requests. Remove RequestedAuthnContext from your AuthnRequest.',
  },
  {
    re: /expired|not valid yet|in the future|session ended/,
    entra: 'Not an IdP setting. Sync your server’s clock with NTP, allow 2–3 minutes of clock skew in your SAML library, and make sure you are not replaying an old response (for example by pressing Back).',
    okta: 'Not an IdP setting. Sync your server’s clock with NTP and allow 2–3 minutes of clock skew. Okta assertions are valid for 5 minutes.',
    google: 'Not an IdP setting. Sync your server’s clock with NTP and allow 2–3 minutes of clock skew.',
  },
  {
    re: /assertion is encrypted|Weak encryption/,
    entra: `${ENTRA_APP} → Token encryption. Upload your SP’s certificate to encrypt, or deactivate it while debugging.`,
    okta: `${OKTA_APP} → General → SAML Settings → Show Advanced Settings → Assertion Encryption. Choose AES256-GCM, or set Unencrypted while debugging.`,
    google: 'Google Workspace does not encrypt SAML assertions.',
  },
  // ----- SCIM -----
  {
    re: /is the string "(True|False)"/,
    entra: 'Entra admin center → Enterprise applications → your app → Provisioning → Admin Credentials. Add ?aadOptscim062020 to the end of the Tenant URL to get standard booleans, or accept "True" and "False" strings on your server.',
    okta: 'Okta sends real booleans. Check the To App attribute mapping in your app’s Provisioning tab.',
  },
  {
    re: /"op" is capitalized|removes members listed in "value"/,
    entra: 'Entra ID always sends these. Make your server compare "op" case-insensitively and accept member values in "value".',
  },
  {
    re: /"userName" is missing|userName has leading|Unknown attribute|belongs in the enterprise extension|must be an object|must be an array/,
    entra: 'Entra admin center → Enterprise applications → your app → Provisioning → Mappings → Provision Microsoft Entra ID Users. Fix the target attribute names there (for example userName, emails[type eq "work"].value).',
    okta: 'Okta Admin Console → Applications → your app → Provisioning → To App → Attribute Mappings, and Directory → Profile Editor for the app’s attribute names.',
  },
  {
    re: /does this user exist|409 Conflict without/,
    entra: 'Entra ID matches users with the filter userName eq "…" (the matching attribute is set under Provisioning → Mappings → Matching precedence).',
    okta: 'Okta matches by userName. Return 409 with scimType "uniqueness" for duplicates and Okta will link the existing user.',
  },
];

/** Fixes for a check: { entra, okta, google } (any may be missing), or null. */
export function fixFor(check) {
  if (check.level === 'ok' || check.level === 'info' && !/transient|not assigned|is encrypted|capitalized|members listed|does this user exist|409/.test(check.title)) return null;
  const hits = RULES.filter((r) => r.re.test(check.title));
  if (!hits.length) return null;
  const out = {};
  for (const k of Object.keys(IDPS)) { const h = hits.find((r) => r[k]); if (h) out[k] = h[k]; }
  return Object.keys(out).length ? out : null;
}
