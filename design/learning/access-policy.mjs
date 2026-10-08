/** Reference decision model, NOT a deployed security boundary.
 * All arguments must come from verified identity + trusted database records.
 * Port to the server and SQL policies, then test against real Auth/RLS/storage.
 */
const channels = new Set(['public', 'member', 'institutional-web', 'edovo', 'securus']);
function current(record, now) {
  return record?.approved === true && !record.revoked &&
    Number.isFinite(record.startsAt) && Number.isFinite(record.endsAt) &&
    record.startsAt <= now && now < record.endsAt;
}
export function canRead({ actor, release, asset, rights, license, now, operation = 'stream' }) {
  if (!Number.isFinite(now) || !channels.has(release?.channel) ||
      !['stream', 'download', 'export'].includes(operation)) return false;
  if (release.status !== 'published' || asset?.state !== 'ready' ||
      !release.assetIds?.includes(asset.id) || !release.versionId) return false;
  if (!current(rights, now) || rights.versionId !== release.versionId ||
      !rights.assetIds?.includes(asset.id) || !rights.channels?.includes(release.channel) ||
      !rights.operations?.includes(operation)) return false;
  // Territories are authoritative policy inputs, never a client-provided country.
  if (!actor?.territory || !rights.territories?.includes(actor.territory)) return false;
  if (release.channel === 'public') return operation !== 'export';
  if (actor.status !== 'active' || actor.emailVerified !== true) return false;
  if (release.channel === 'member') return actor.invited === true && operation !== 'export';
  if (!current(license, now) || license.versionId !== release.versionId ||
      license.channel !== release.channel || !license.assetIds?.includes(asset.id) ||
      !license.operations?.includes(operation) || !license.territories?.includes(actor.territory)) return false;
  if (!actor.organizationId || actor.organizationId !== license.organizationId ||
      !actor.facilityId || !license.facilityIds?.includes(actor.facilityId)) return false;
  if (operation === 'export') return actor.roles?.includes('license_manager') === true && actor.mfa === true;
  // External-platform editions go through separately authorized release packages.
  return release.channel === 'institutional-web' && actor.seatActive === true;
}
export function canManage({ actor, action, ownerId }) {
  if (actor?.status !== 'active' || !actor.emailVerified || !actor.mfa) return false;
  const roles = actor.roles ?? [];
  if (['publish', 'unpublish', 'approve'].includes(action)) return roles.includes('publisher');
  if (['license', 'export'].includes(action)) return roles.includes('license_manager');
  if (action === 'contributors') return roles.includes('admin');
  if (['draft', 'upload', 'submit'].includes(action)) return roles.includes('publisher') ||
    (roles.includes('contributor') && ownerId === actor.id);
  return false;
}
