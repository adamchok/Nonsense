import { LegalPage } from '@/components/web/legal-page';
import { PRIVACY_POLICY } from '@/lib/legal-content';

export default function PrivacyScreen() {
  return <LegalPage doc={PRIVACY_POLICY} />;
}
