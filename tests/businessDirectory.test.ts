import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWebsite, searchBusinesses, type DirectoryBusiness } from '../src/services/businessDirectory';

test('directory search and safe contact URLs', () => {
  const rows = [{ business_name: 'Joe’s BBQ', city: 'Newark', state: 'NJ', phone: '(609) 123-4567', categories: ['Restaurant'] }] as DirectoryBusiness[];
  assert.equal(searchBusinesses(rows,'newark NJ').length,1);
  assert.equal(searchBusinesses(rows,'6091234567').length,1);
  assert.equal(searchBusinesses(rows,'','Retail').length,0);
  assert.equal(safeWebsite('javascript:alert(1)'),null);
  assert.equal(safeWebsite('https://user:password@example.com'),null);
  assert.equal(safeWebsite('https://example.com'),'https://example.com/');
});
