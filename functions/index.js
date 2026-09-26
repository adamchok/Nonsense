import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

import { runGuestLinkMigration } from './migrate.js';

initializeApp();

export const migrateAcceptedGuestLink = onDocumentUpdated(
  { document: 'guest_links/{linkId}', region: 'asia-southeast1', retry: false },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (before?.status !== 'pending' || after?.status !== 'accepted') return;
    await runGuestLinkMigration(getFirestore(), event.params.linkId, logger);
  }
);
