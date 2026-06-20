import assert from 'node:assert/strict';
import {
  getAdjacentStaffTabRoot,
  getStaffTabRootIndex,
  isExactMainTabRoot,
  isStaffSwipeableTabRoot,
  isStaffTabToTabNavigation,
  STAFF_SWIPEABLE_TAB_ROOTS,
} from '../src/lib/navigation/main-tab-roots.ts';

function run(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`fail ${name}`);
    throw error;
  }
}

run('staff tab roots order', () => {
  assert.deepEqual(STAFF_SWIPEABLE_TAB_ROOTS, [
    '/staff/history',
    '/staff/dashboard',
    '/profile',
  ]);
});

run('isExactMainTabRoot exact match only', () => {
  assert.equal(isExactMainTabRoot('/staff/dashboard'), true);
  assert.equal(isExactMainTabRoot('/staff/dashboard/foo'), false);
  assert.equal(isExactMainTabRoot('/staff/reservas'), false);
  assert.equal(isExactMainTabRoot('/profile'), true);
});

run('getStaffTabRootIndex', () => {
  assert.equal(getStaffTabRootIndex('/staff/history'), 0);
  assert.equal(getStaffTabRootIndex('/staff/dashboard'), 1);
  assert.equal(getStaffTabRootIndex('/profile'), 2);
  assert.equal(getStaffTabRootIndex('/staff/reservas'), -1);
});

run('getAdjacentStaffTabRoot with edge resistance', () => {
  assert.equal(getAdjacentStaffTabRoot('/staff/history', 'prev'), null);
  assert.equal(getAdjacentStaffTabRoot('/staff/history', 'next'), '/staff/dashboard');
  assert.equal(getAdjacentStaffTabRoot('/profile', 'next'), null);
  assert.equal(getAdjacentStaffTabRoot('/profile', 'prev'), '/staff/dashboard');
});

run('isStaffTabToTabNavigation', () => {
  assert.equal(
    isStaffTabToTabNavigation('/staff/history', '/staff/dashboard'),
    true
  );
  assert.equal(
    isStaffTabToTabNavigation('/staff/dashboard', '/staff/reservas'),
    false
  );
});

run('isStaffSwipeableTabRoot type guard', () => {
  assert.equal(isStaffSwipeableTabRoot('/profile'), true);
  assert.equal(isStaffSwipeableTabRoot('/orders/new'), false);
});

console.log('navigation helpers: all checks passed');
