import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { HostingLiveSessionError, deleteAccountData } from './delete-account.js';
import { runGuestLinkMigration } from './migrate.js';

/** The app re-confirms the user's identity right before calling deleteAccount; older sign-ins are refused. */
const RECENT_SIGN_IN_SECONDS = 5 * 60;

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

/** Self-service account deletion: removes the player's data (see delete-account.js), then the login itself. */
export const deleteAccount = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to delete your account.');
  const token = request.auth.token;
  const isAnonymous = token.firebase?.sign_in_provider === 'anonymous';
  if (!isAnonymous && Date.now() / 1000 - Number(token.auth_time ?? 0) > RECENT_SIGN_IN_SECONDS) {
    throw new HttpsError('failed-precondition', 'Confirm it is you again, then retry.', { reason: 'recent-login' });
  }

  try {
    await deleteAccountData(getFirestore(), uid);
  } catch (err) {
    if (err instanceof HostingLiveSessionError) {
      throw new HttpsError('failed-precondition', err.message, { reason: 'live-session' });
    }
    logger.error('Account data deletion failed', { uid, error: err instanceof Error ? err.stack : String(err) });
    throw new HttpsError('internal', 'Could not delete your account. Please try again.');
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') {
      logger.error('Auth user deletion failed', { uid, error: err instanceof Error ? err.stack : String(err) });
      throw new HttpsError('internal', 'Could not delete your account. Please try again.');
    }
  }
  logger.info('Account deleted', { uid });
  return { deleted: true };
});
