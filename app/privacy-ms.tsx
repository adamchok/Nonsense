import { LegalPage } from '@/components/web/legal-page';
import { PRIVACY_POLICY_MS } from '@/lib/legal-content-ms';

export default function PrivacyMalayScreen() {
  return <LegalPage doc={PRIVACY_POLICY_MS} />;
}
