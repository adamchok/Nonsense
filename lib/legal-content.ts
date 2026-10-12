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
};

export const SITE_URL = 'https://nonsense.adamchok.com';
/** Bump with the effective date whenever the Terms or Privacy Policy change; stored with each acceptance. */
export const TERMS_VERSION = '2026-10-12';

const SUPPORT_EMAIL = 'support@adamchok.com';
const supportLink = { link: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` };
const siteLink = { link: 'nonsense.adamchok.com', href: SITE_URL };
const privacyLink = { link: 'Privacy Policy', href: '/privacy' };

const p = (...parts: Inline[]): Block => ({ type: 'p', parts });
const list = (...items: Inline[][]): Block => ({ type: 'list', items });

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy Policy',
  metaTitle: 'Privacy Policy · Nonsense',
  description: 'How Nonsense, a free home-poker session tracker, collects, uses and protects your information.',
  effective: 'Effective 12 October 2026',
  intro: [
    'Nonsense is a poker session tracker for home games, available on Android and at ',
    siteLink,
    '. It is built and run by Adam Chok, an individual developer (“we”, “us”). This policy explains what information Nonsense collects, how it is used, and the choices you have.',
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
          ' The display name and avatar emoji you choose. These are shown to your friends, group members and other players in sessions you join.'
        ),
        p(
          { bold: 'Content you create.' },
          ' Poker sessions and their details (date and time, optional location name, optional blinds, buy-ins, re-entries, cash-outs, results and settlements), the players in each session, your saved locations, friends and friend requests, your friend reference code, and groups and their members.'
        ),
        p({ bold: 'Settings on your device.' }, ' Your theme preference and sign-in state are stored locally on your device.'),
        p(
          { bold: 'Technical information.' },
          ' Our hosting and backend providers process standard technical data, such as IP addresses and request logs, to deliver and secure the service.'
        ),
        p(
          { bold: 'Camera and photos.' },
          ' Nonsense uses the camera, or a photo you pick from your library, only to read friend QR codes. The image is processed on your device and is not uploaded or stored. Nonsense does not record audio.'
        ),
        p('We do not use advertising, advertising IDs, or third-party analytics or tracking tools.'),
      ],
    },
    {
      id: 'how-we-use-information',
      title: 'How we use information',
      blocks: [
        list(
          ['To sign you in and keep your records in sync across your devices.'],
          ['To show session results, history, statistics and leaderboards to you and to the people you play with.'],
          ['To let you find and connect with friends and groups.'],
          ['To send account emails, such as email verification and password reset.'],
          ['To keep the service secure and working, and to fix problems.']
        ),
        p('We do not sell your information or use it for advertising.'),
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
          ' Your display name, avatar and reference code can be seen by people who add you as a friend. Session details and results are visible to the players in that session, and group leaderboards are visible to that group’s members.'
        ),
        p(
          { bold: 'Service providers.' },
          ' We use Google Firebase (authentication and database, with data stored in Singapore), Cloudflare (website hosting) and Expo (app updates). They process data on our behalf to run the service.'
        ),
        p(
          { bold: 'Legal reasons.' },
          ' We may disclose information if required by law or to protect the rights and safety of users and others.'
        ),
      ],
    },
    {
      id: 'retention-and-deletion',
      title: 'Retention and deletion',
      blocks: [
        p(
          'We keep your information for as long as your account exists. You can ask us to delete your account and its data at any time by emailing ',
          supportLink,
          ' from the email address on your account. We will delete your account within 30 days. Session records that other players also rely on may keep the amounts recorded, so their history stays accurate, but your name and profile will be removed from them.'
        ),
      ],
    },
    {
      id: 'security',
      title: 'Security',
      blocks: [
        p(
          'Data is sent over encrypted connections (HTTPS) and access to stored data is restricted by database security rules. No system is perfectly secure, but we take reasonable steps to protect your information.'
        ),
      ],
    },
    {
      id: 'your-rights',
      title: 'Your rights',
      blocks: [
        p(
          'Depending on where you live, you may have the right to access, correct, delete or export your personal data, or to object to how it is used. You can update your name and avatar in the app at any time. For anything else, contact us at the address below.'
        ),
      ],
    },
    {
      id: 'children',
      title: 'Children',
      blocks: [
        p(
          'Nonsense is intended for adults aged 18 and over and is not directed at children. If you believe a child has created an account, contact us and we will delete it.'
        ),
      ],
    },
    {
      id: 'changes-to-this-policy',
      title: 'Changes to this policy',
      blocks: [
        p(
          'We may update this policy. If we make significant changes we will update the date above and, where appropriate, let you know in the app.'
        ),
      ],
    },
    { id: 'contact', title: 'Contact', blocks: [p('Questions or requests: ', supportLink)] },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: 'Terms of Service',
  metaTitle: 'Terms of Service · Nonsense',
  description: 'The terms for using Nonsense, a free home-poker session tracker.',
  effective: 'Effective 12 October 2026',
  intro: [
    'These terms apply to your use of Nonsense, on Android and at ',
    siteLink,
    ', run by Adam Chok (“we”, “us”). By using Nonsense you agree to these terms. If you do not agree, do not use it.',
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
      id: 'your-responsibilities',
      title: 'Your responsibilities',
      blocks: [
        list(
          [
            'You are responsible for making sure your games, and your use of Nonsense, comply with the laws where you live, including any laws on gambling.',
          ],
          ['Keep your sign-in details secure. You are responsible for activity on your account.'],
          [
            'Only add other people to sessions, friends or groups in ways they would expect, and do not enter false or offensive information about others.',
          ],
          [
            'Do not misuse the service: no attempts to break in, overload or disrupt it, access other users’ data, or use it for anything unlawful.',
          ]
        ),
      ],
    },
    {
      id: 'your-content',
      title: 'Your content',
      blocks: [
        p(
          'You own the information you enter. You allow us to store and display it as needed to run Nonsense, including showing it to the people you play with. How we handle personal data is described in our ',
          privacyLink,
          '.'
        ),
      ],
    },
    {
      id: 'accuracy',
      title: 'Accuracy',
      blocks: [
        p(
          'Results, statistics and settle-up suggestions are calculated from what players enter. Check them before relying on them. We are not responsible for disputes between players.'
        ),
      ],
    },
    {
      id: 'availability-and-changes',
      title: 'Availability and changes',
      blocks: [
        p(
          'Nonsense is provided free of charge. We may change, suspend or stop the service, or any feature, at any time. We may suspend or close accounts that break these terms.'
        ),
      ],
    },
    {
      id: 'ending-your-use',
      title: 'Ending your use',
      blocks: [
        p(
          'You can stop using Nonsense at any time and ask us to delete your account as described in the ',
          privacyLink,
          '.'
        ),
      ],
    },
    {
      id: 'disclaimer',
      title: 'Disclaimer',
      blocks: [
        p(
          'Nonsense is provided “as is” and “as available”, without warranties of any kind, to the extent allowed by law. We do not guarantee that it will be error-free or always available, or that data will never be lost.'
        ),
      ],
    },
    {
      id: 'limitation-of-liability',
      title: 'Limitation of liability',
      blocks: [
        p(
          'To the extent allowed by law, we are not liable for any indirect or consequential loss, or for any loss of money, data or profits, arising from your use of Nonsense. Nothing in these terms limits liability that cannot be limited by law.'
        ),
      ],
    },
    {
      id: 'changes-to-these-terms',
      title: 'Changes to these terms',
      blocks: [
        p(
          'We may update these terms. If we make significant changes we will update the date above. Continuing to use Nonsense after a change means you accept the updated terms.'
        ),
      ],
    },
    { id: 'contact', title: 'Contact', blocks: [p('Questions: ', supportLink)] },
  ],
};
