export type Inline = string | { bold: string } | { link: string; href: string };
export type Block = { type: 'p'; parts: Inline[] } | { type: 'list'; items: Inline[][] };
export type LegalSection = { id: string; title: string; blocks: Block[] };
export type LegalDoc = {
  title: string;
  metaTitle: string;
  description: string;
  effective: string;
  intro: Inline[];
  sections: LegalSection[];
  /** BCP 47 language of the text, for screen readers. Defaults to English. */
  lang?: string;
  /** Heading of the in-page contents list. Defaults to "On this page". */
  tocLabel?: string;
};

export const SITE_URL = 'https://nonsense.adamchok.com';
/** Bump with the effective date whenever the Terms or Privacy Policy change; stored with each acceptance. */
export const TERMS_VERSION = '2026-10-13';

export const SUPPORT_EMAIL = 'support@adamchok.com';
export const supportLink = { link: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` };
const siteLink = { link: 'nonsense.adamchok.com', href: SITE_URL };
const privacyLink = { link: 'Privacy Policy', href: '/privacy' };
const malayLink = { link: 'Bahasa Melayu', href: '/privacy-ms' };
export const JPDP_LINK = { link: 'Personal Data Protection Department (JPDP)', href: 'https://www.pdp.gov.my' };
export const EU_DPA_LINK = {
  link: 'list of EU data protection authorities',
  href: 'https://edpb.europa.eu/about-edpb/about-edpb/members_en',
};
export const ICO_LINK = { link: 'Information Commissioner’s Office', href: 'https://ico.org.uk/make-a-complaint/' };

export const p = (...parts: Inline[]): Block => ({ type: 'p', parts });
export const list = (...items: Inline[][]): Block => ({ type: 'list', items });

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy Policy',
  metaTitle: 'Privacy Policy · Nonsense',
  description: 'How Nonsense, a free home-poker session tracker, collects, uses and protects your information.',
  effective: 'Effective 13 October 2026',
  intro: [
    'Nonsense is a poker session tracker for home games, available on Android and at ',
    siteLink,
    '. It is built and run by Adam Chok, an individual developer based in Malaysia (“we”, “us”), who is responsible for your personal data as described here. This policy explains what information Nonsense collects, why, who can see it, and the choices and rights you have. It is also available in ',
    malayLink,
    '.',
  ],
  sections: [
    {
      id: 'information-we-collect',
      title: 'Information we collect',
      blocks: [
        p(
          { bold: 'Account information.' },
          ' When you sign in we receive your email address and a unique account ID from Firebase Authentication. If you sign in with Google, we receive your Google account’s email address and basic profile information for the purpose of signing you in. If you sign up with email and password, your password is handled by Firebase Authentication and is never visible to us.'
        ),
        p(
          { bold: 'Profile.' },
          ' The display name and avatar you choose, and your friend reference code. These are shown to your friends, group members and other players in sessions you join.'
        ),
        p(
          { bold: 'Content you create.' },
          ' Poker sessions and their details (date and time, optional location name, optional blinds, buy-ins, re-entries, cash-outs, results and settlements), your saved locations, friends and friend requests, and groups and their members.'
        ),
        p(
          { bold: 'Information about other people.' },
          ' When you host a session you may add other players, including guests who do not use Nonsense, by entering a name for them. Other users may likewise add you to their sessions and groups. Only add people in ways they would expect.'
        ),
        p({ bold: 'Settings on your device.' }, ' Your theme preference and sign-in state are stored locally on your device.'),
        p(
          { bold: 'Technical information.' },
          ' Our hosting and backend providers process standard technical data, such as IP addresses, device and browser type, and request logs, to deliver and secure the service.'
        ),
        p(
          { bold: 'Camera and photos.' },
          ' Nonsense uses the camera, or a photo you pick from your library, only to read friend QR codes, and only after you allow it in your device settings. The image is processed on your device and is not uploaded or stored. Nonsense does not record audio.'
        ),
        p(
          { bold: 'What is required.' },
          ' An account (email or Google) and a display name are needed to use Nonsense. Everything else, such as locations, blinds, avatars, friends and groups, is optional. If you do not provide the required information you will not be able to use the app.'
        ),
        p(
          'Please do not enter sensitive information, such as health, religious or financial account details, in names, locations or other free-text fields.'
        ),
      ],
    },
    {
      id: 'where-information-comes-from',
      title: 'Where information comes from',
      blocks: [
        list(
          ['From you, when you sign up, edit your profile and use the app.'],
          ['From Google, if you choose to sign in with Google.'],
          ['From other users, when they add you to a session, a group or their friends list.'],
          ['Automatically, from your device and our service providers, as described above.']
        ),
      ],
    },
    {
      id: 'how-we-use-information',
      title: 'How we use information',
      blocks: [
        p(
          'We only use personal data for the purposes below. Where data protection laws such as the GDPR ask for a legal basis, it is shown in brackets.'
        ),
        list(
          [
            'To create your account, sign you in and keep your records in sync across your devices (to provide the service you asked for).',
          ],
          [
            'To show session results, history, statistics and leaderboards to you and to the people you play with, including keeping shared session records accurate for the other players (to provide the service, and our and other players’ legitimate interest in an accurate shared record).',
          ],
          ['To let you find and connect with friends and groups (to provide the service).'],
          [
            'To send account emails, such as email verification and password reset (to provide the service). We do not send marketing emails.',
          ],
          [
            'To keep the service secure, prevent misuse, and find and fix problems (our legitimate interest in running a safe, working service).',
          ],
          ['To comply with the law and respond to lawful requests (legal obligation).'],
          ['To read a friend QR code with your camera (your permission, which you can withdraw in your device settings).']
        ),
        p(
          'We do not sell your information, use it for advertising, build advertising profiles, use it to train AI models, or make automated decisions about you that have legal or similarly significant effects.'
        ),
      ],
    },
    {
      id: 'google-user-data',
      title: 'Google user data',
      blocks: [
        p(
          'If you sign in with Google, Nonsense only accesses your email address and basic profile information, and uses them only to create and sign in to your Nonsense account. We do not access any other Google data. Nonsense’s use and transfer of information received from Google APIs adheres to the ',
          {
            link: 'Google API Services User Data Policy',
            href: 'https://developers.google.com/terms/api-services-user-data-policy',
          },
          ', including the Limited Use requirements.'
        ),
      ],
    },
    {
      id: 'who-can-see-your-information',
      title: 'Who can see your information',
      blocks: [
        p(
          { bold: 'Other users.' },
          ' Your display name, avatar and reference code can be seen by people who add you as a friend. Session details and results are visible to the players in that session, and group leaderboards are visible to that group’s members. Anyone you share a session summary or QR code with can see what it contains.'
        ),
        p(
          { bold: 'Service providers.' },
          ' Google Firebase (sign-in, database and server functions; the database is stored in Singapore), Cloudflare (website hosting) and Expo (app updates). They process data on our behalf, under their data protection terms, only to run the service.'
        ),
        p(
          { bold: 'Legal reasons.' },
          ' We may disclose information if required by law, or where needed to protect the rights, property or safety of users and others.'
        ),
        p(
          { bold: 'A new owner.' },
          ' If Nonsense is ever transferred to someone else, your information may move with it, and this policy will continue to apply to it.'
        ),
        p('We do not share your information with anyone else.'),
      ],
    },
    {
      id: 'cookies-and-local-storage',
      title: 'Cookies and local storage',
      blocks: [
        p(
          'Nonsense does not use advertising, analytics or tracking cookies. The website and app store a few items on your device that are strictly necessary for them to work: your sign-in session (kept by Firebase Authentication), your theme preference, and a note of whether you were signed in, so the right page loads first. Because these are essential, we do not ask for consent to them. You can clear them at any time in your browser or device settings, which will sign you out.'
        ),
      ],
    },
    {
      id: 'international-transfers',
      title: 'Where your data is processed',
      blocks: [
        p(
          'Your database records are stored in Singapore. Our service providers may also process data in other countries, including the United States, where privacy laws may differ from those where you live. When data is transferred, we rely on our providers’ data protection commitments, including standard contractual clauses where the law requires them, so that it stays protected to a comparable standard.'
        ),
      ],
    },
    {
      id: 'retention-and-deletion',
      title: 'Retention and deletion',
      blocks: [
        p(
          'We keep your information for as long as your account exists. You can delete your account at any time in the app under Profile, then Delete account; this takes effect immediately. If you cannot sign in, email ',
          supportLink,
          ' from the email address on your account and we will delete it within 30 days.'
        ),
        p(
          'Deleting your account removes your profile, sign-in, friends, friend requests, groups you own, saved locations and sessions only you and your guests played. Sessions other players took part in keep the amounts recorded, so their history stays accurate, but your name is replaced with “Deleted player” and is no longer linked to any profile.'
        ),
        p(
          'Deleted data may remain in our providers’ backups for a limited period (for Google Cloud, up to about 180 days) before it is permanently erased, and is not used in the meantime. Technical logs are kept by our providers for short periods for security. Information that has been anonymised so it can no longer identify you may be kept.'
        ),
      ],
    },
    {
      id: 'security',
      title: 'Security',
      blocks: [
        p(
          'Data is sent over encrypted connections (HTTPS), stored encrypted by our providers, and protected by access rules so that only the right people can read it. No system is perfectly secure, but we take reasonable steps to protect your information. If a data breach is likely to cause you significant harm, we will tell you and the relevant authorities as the law requires.'
        ),
      ],
    },
    {
      id: 'your-rights',
      title: 'Your rights and choices',
      blocks: [
        p('Depending on where you live, you have some or all of these rights:'),
        list(
          [{ bold: 'Access.' }, ' Ask for a copy of the personal data we hold about you.'],
          [
            { bold: 'Correction.' },
            ' Fix inaccurate data. You can change your name and avatar in the app at any time.',
          ],
          [
            { bold: 'Deletion.' },
            ' Delete your account in the app under Profile, then Delete account, or ask us to delete specific data.',
          ],
          [{ bold: 'Portability.' }, ' Ask for your data in a common, machine-readable format.'],
          [
            { bold: 'Objection and restriction.' },
            ' Object to, or ask us to limit, how we use your data, including where we rely on legitimate interests.',
          ],
          [
            { bold: 'Withdrawing permission.' },
            ' Turn off camera access in your device settings at any time.',
          ]
        ),
        p(
          'To make a request, email ',
          supportLink,
          ' from the email address on your account so we can confirm it is you. Requests are free, and we will reply within 21 days (or sooner where the law requires). If we cannot do what you ask, we will explain why.'
        ),
        p(
          'If you are unhappy with how we handle your data, please contact us first. You can also complain to a data protection authority: in Malaysia, the ',
          JPDP_LINK,
          '; in the EU, your local authority (see the ',
          EU_DPA_LINK,
          '); in the UK, the ',
          ICO_LINK,
          '.'
        ),
      ],
    },
    {
      id: 'us-residents',
      title: 'Notice for US residents',
      blocks: [
        p(
          'We do not sell or share personal information for targeted advertising, as those terms are defined in US state privacy laws, and we do not use sensitive personal information to infer characteristics about you. You can use the rights described above, and we will not treat you differently for doing so.'
        ),
      ],
    },
    {
      id: 'children',
      title: 'Children',
      blocks: [
        p(
          'Nonsense is intended for adults aged 18 and over and is not directed at children. If you believe a child has created an account or been added to a session, contact us and we will delete their information.'
        ),
      ],
    },
    {
      id: 'changes-to-this-policy',
      title: 'Changes to this policy',
      blocks: [
        p(
          'We may update this policy. If we make significant changes we will update the date above and let you know in the app before they take effect. This policy is available in English and Bahasa Melayu; if the two differ, the English version applies.'
        ),
      ],
    },
    { id: 'contact', title: 'Contact', blocks: [p('Adam Chok, Malaysia. Questions or requests: ', supportLink)] },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: 'Terms of Service',
  metaTitle: 'Terms of Service · Nonsense',
  description: 'The terms for using Nonsense, a free home-poker session tracker.',
  effective: 'Effective 13 October 2026',
  intro: [
    'These terms apply to your use of Nonsense, on Android and at ',
    siteLink,
    ', run by Adam Chok, an individual developer based in Malaysia (“we”, “us”). By creating an account or using Nonsense you agree to these terms and to our ',
    privacyLink,
    '. If you do not agree, do not use Nonsense.',
  ],
  sections: [
    {
      id: 'what-nonsense-is',
      title: 'What Nonsense is',
      blocks: [
        p(
          'Nonsense is a record-keeping tool for home poker games. It lets you record buy-ins, cash-outs and results and suggests how players could settle up. Nonsense does not hold, transfer or process money, does not accept bets, and is not a gambling service. Any settling up happens between players, outside the app.'
        ),
      ],
    },
    {
      id: 'eligibility',
      title: 'Eligibility',
      blocks: [
        p('You must be at least 18 years old, or the age of majority where you live if that is higher, to use Nonsense.'),
      ],
    },
    {
      id: 'your-account',
      title: 'Your account',
      blocks: [
        list(
          ['Give accurate information when you sign up and keep it up to date. An account is for one person only.'],
          [
            'Keep your sign-in details secure. You are responsible for activity on your account. Tell us straight away if you think someone else has used it.',
          ],
          ['You can delete your account at any time in the app under Profile, then Delete account.']
        ),
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      blocks: [
        p('When you use Nonsense you agree:'),
        list(
          [
            'To make sure your games, and your use of Nonsense, comply with the laws where you live, including any laws on gambling.',
          ],
          [
            'To only add other people to sessions, friends or groups in ways they would expect, and not to enter false, offensive or sensitive information about anyone.',
          ],
          ['Not to harass, impersonate or mislead other users.'],
          [
            'Not to break into, overload, disrupt, scrape or automate access to the service, or try to access other users’ data.',
          ],
          [
            'Not to copy, modify, reverse engineer or resell the app, except where the law allows you to despite this restriction.',
          ],
          ['Not to use Nonsense for anything unlawful.']
        ),
      ],
    },
    {
      id: 'your-content',
      title: 'Your content',
      blocks: [
        p(
          'You own the information you enter. You allow us to store, copy and display it as needed to run Nonsense, including showing it to the people you play with, and to keep anonymised session records for other players after you delete your account, as described in our ',
          privacyLink,
          '. We may remove content that breaks these terms.'
        ),
      ],
    },
    {
      id: 'our-app',
      title: 'Our app',
      blocks: [
        p(
          'Nonsense, including its design, code, name and logo, belongs to us. We give you a personal, non-exclusive, non-transferable licence to use it for your own non-commercial purposes while you follow these terms. If you send us feedback or ideas, we may use them freely without paying you.'
        ),
      ],
    },
    {
      id: 'other-users-and-services',
      title: 'Other users and services',
      blocks: [
        p(
          'Results, statistics and settle-up suggestions are calculated from what players enter. Check them before relying on them. Your dealings with other players, including paying or collecting money, are between you and them; we are not responsible for disputes between players.'
        ),
        p(
          'Nonsense relies on services from others, such as Google sign-in and app stores, whose own terms apply when you use them. We are not responsible for those services.'
        ),
      ],
    },
    {
      id: 'availability-and-changes',
      title: 'Availability and changes',
      blocks: [
        p(
          'Nonsense is provided free of charge. We may change, suspend or stop the service, or any feature, at any time, and we do not promise to provide support. Where practical we will give notice before stopping the service so you can stop using it.'
        ),
      ],
    },
    {
      id: 'suspension-and-ending',
      title: 'Suspension and ending',
      blocks: [
        p(
          'You can stop using Nonsense at any time and delete your account as described above. We may suspend or close an account that breaks these terms or puts other users or the service at risk. The sections on your content, our app, disclaimers, liability and governing law continue to apply after your use ends.'
        ),
      ],
    },
    {
      id: 'disclaimer',
      title: 'Disclaimer',
      blocks: [
        p(
          'Nonsense is provided “as is” and “as available”, without warranties of any kind, to the extent allowed by law. We do not guarantee that it will be error-free, secure or always available, or that data will never be lost.'
        ),
      ],
    },
    {
      id: 'limitation-of-liability',
      title: 'Limitation of liability',
      blocks: [
        p(
          'To the extent allowed by law, we are not liable for any indirect or consequential loss, or for any loss of money, data or profits, arising from your use of Nonsense, and our total liability to you for any claim is limited to RM 200. You are responsible for losses we suffer because you broke these terms or the law.'
        ),
        p(
          'Nothing in these terms limits liability that cannot be limited by law, such as for death or personal injury caused by negligence or for fraud, or takes away rights you have as a consumer under the laws where you live.'
        ),
      ],
    },
    {
      id: 'governing-law',
      title: 'Governing law and disputes',
      blocks: [
        p(
          'These terms are governed by the laws of Malaysia, and the courts of Malaysia can decide disputes about them. If you live elsewhere, you keep the protection of the mandatory laws of your country and may also bring a claim in your local courts where that law allows. Please contact us first so we can try to resolve any problem informally.'
        ),
      ],
    },
    {
      id: 'general',
      title: 'General',
      blocks: [
        p(
          'These terms and the Privacy Policy are the whole agreement between you and us about Nonsense. If part of these terms cannot be enforced, the rest still applies. If we do not enforce a term straight away, we can still enforce it later. You may not transfer your rights under these terms; we may transfer ours to someone who takes over Nonsense.'
        ),
      ],
    },
    {
      id: 'changes-to-these-terms',
      title: 'Changes to these terms',
      blocks: [
        p(
          'We may update these terms. If we make significant changes we will update the date above and let you know in the app before they take effect. Continuing to use Nonsense after a change means you accept the updated terms.'
        ),
      ],
    },
    { id: 'contact', title: 'Contact', blocks: [p('Adam Chok, Malaysia. Questions: ', supportLink)] },
  ],
};
