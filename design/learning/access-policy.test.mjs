import test from 'node:test';
import assert from 'node:assert/strict';
import { canRead, canManage } from './access-policy.mjs';
const now = 100;
function fixture(channel = 'member') {
  return { now, actor: { id: 'a', status: 'active', emailVerified: true, invited: true,
    territory: 'US', organizationId: 'org-a', facilityId: 'facility-a', seatActive: true },
  release: { status: 'published', channel, versionId: 'v1', assetIds: ['asset-a'] },
  asset: { id: 'asset-a', state: 'ready' },
  rights: { approved: true, startsAt: 0, endsAt: 200, versionId: 'v1',
    assetIds: ['asset-a'], channels: [channel], operations: ['stream', 'download', 'export'], territories: ['US'] },
  license: { approved: true, startsAt: 0, endsAt: 200, versionId: 'v1', channel,
    assetIds: ['asset-a'], operations: ['stream', 'download', 'export'], territories: ['US'],
    organizationId: 'org-a', facilityIds: ['facility-a'] } };
}
for (const channel of ['public', 'member', 'institutional-web']) {
  test(`${channel}: valid scoped release allowed`, () => assert.equal(canRead(fixture(channel)), true));
  for (const [label, mutate] of [
    ['draft', f => f.release.status = 'draft'], ['processing', f => f.asset.state = 'processing'],
    ['rights expired', f => f.rights.endsAt = now], ['rights not started', f => f.rights.startsAt = now + 1],
    ['revoked rights', f => f.rights.revoked = true], ['unapproved rights', f => f.rights.approved = false],
    ['wrong channel rights', f => f.rights.channels = []], ['wrong version rights', f => f.rights.versionId = 'v2'],
    ['wrong asset rights', f => f.rights.assetIds = ['asset-b']], ['wrong territory', f => f.actor.territory = 'CA'],
    ['missing timestamp', f => f.rights.endsAt = undefined], ['unknown operation', f => f.operation = 'magic'],
    ['unattached asset', f => f.release.assetIds = []], ['missing ready asset', f => f.asset = null],
    ['download denied', f => { f.operation = 'download'; f.rights.operations = ['stream']; }]
  ]) test(`${channel}: rejects ${label}`, () => { const f = fixture(channel); mutate(f); assert.equal(canRead(f), false); });
}
for (const channel of ['member', 'institutional-web']) {
  for (const status of ['suspended', 'removed', 'pending']) test(`${channel}: rejects ${status}`, () => {
    const f = fixture(channel); f.actor.status = status; assert.equal(canRead(f), false);
  });
  test(`${channel}: unverified denied`, () => { const f = fixture(channel); f.actor.emailVerified = false; assert.equal(canRead(f), false); });
}
test('public does not require a member account', () => { const f = fixture('public'); f.actor = { territory: 'US' }; assert.equal(canRead(f), true); });
test('member invitation required', () => { const f = fixture(); f.actor.invited = false; assert.equal(canRead(f), false); });
for (const [label, mutate] of [
  ['expired license', f => f.license.endsAt = now], ['revoked license', f => f.license.revoked = true],
  ['wrong organization', f => f.actor.organizationId = 'org-b'], ['wrong facility', f => f.actor.facilityId = 'facility-b'],
  ['wrong licensed version', f => f.license.versionId = 'v2'], ['wrong licensed channel', f => f.license.channel = 'edovo'],
  ['wrong licensed asset', f => f.license.assetIds = []], ['inactive seat', f => f.actor.seatActive = false]
]) test(`institution: rejects ${label}`, () => { const f = fixture('institutional-web'); mutate(f); assert.equal(canRead(f), false); });
for (const channel of ['edovo', 'securus']) {
  test(`${channel}: cannot stream as a web member`, () => assert.equal(canRead(fixture(channel)), false));
  test(`${channel}: export needs license manager MFA`, () => {
    const f = fixture(channel); f.operation = 'export'; assert.equal(canRead(f), false);
    f.actor.roles = ['license_manager']; f.actor.mfa = true; assert.equal(canRead(f), true);
    f.actor.mfa = false; assert.equal(canRead(f), false);
  });
}
test('staff role does not bypass learner visibility', () => { const f = fixture(); f.actor.roles = ['admin']; f.release.status = 'draft'; assert.equal(canRead(f), false); });
const staff = { id: 'a', status: 'active', emailVerified: true, mfa: true, roles: ['contributor'] };
test('contributor submits own draft but cannot publish or manage licenses', () => {
  assert.equal(canManage({ actor: staff, action: 'submit', ownerId: 'a' }), true);
  assert.equal(canManage({ actor: staff, action: 'submit', ownerId: 'b' }), false);
  for (const action of ['publish', 'license', 'contributors']) assert.equal(canManage({ actor: staff, action }), false);
});
test('publisher requires MFA; admin is not automatically publisher', () => {
  assert.equal(canManage({ actor: { ...staff, roles: ['publisher'] }, action: 'publish' }), true);
  assert.equal(canManage({ actor: { ...staff, roles: ['publisher'], mfa: false }, action: 'publish' }), false);
  assert.equal(canManage({ actor: { ...staff, roles: ['admin'] }, action: 'publish' }), false);
});
