import { LegalPage } from '@/components/web/legal-page';
import { TERMS_OF_SERVICE } from '@/lib/legal-content';

export default function TermsScreen() {
  return <LegalPage doc={TERMS_OF_SERVICE} />;
}
