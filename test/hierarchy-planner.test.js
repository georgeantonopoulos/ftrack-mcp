import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClearCustomAttributesData,
  planHierarchyLevel,
  sanitizeEntityFields,
} from '../src/hierarchy-planner.js';

test('plans a create only under the provided parent', () => {
  const plan = planHierarchyLevel({
    projectId: 'project-1',
    parentId: 'assets-folder',
    parentKind: 'Assets',
    entityType: 'AssetBuild',
    nodes: [{ name: 'CharacterA', fields: { status_id: 'status-1' } }],
    existingChildren: [],
  });

  assert.equal(plan.errors.length, 0);
  assert.equal(plan.creates.length, 1);
  assert.deepEqual(plan.operations, [{
    action: 'create',
    entity_type: 'AssetBuild',
    entity_data: {
      name: 'CharacterA',
      parent_id: 'assets-folder',
      project_id: 'project-1',
      status_id: 'status-1',
    },
  }]);
});

test('reuses existing children by name and clears AYON custom attributes natively', () => {
  const plan = planHierarchyLevel({
    projectId: 'project-1',
    parentId: 'shot-parent',
    parentKind: 'Shot',
    entityType: 'Task',
    nodes: [{ name: 'Compositing', clear_custom_attributes: true }],
    existingChildren: [{ id: 'task-1', name: 'Compositing', parent_id: 'shot-parent' }],
  });

  assert.equal(plan.creates.length, 0);
  assert.equal(plan.reused[0].id, 'task-1');
  assert.deepEqual(plan.custom_attributes_cleared[0].keys, ['ayon_id', 'ayon_path']);
  assert.deepEqual(plan.operations, [{
    action: 'update',
    entity_type: 'Task',
    entity_data: {
      custom_attributes: {
        ayon_id: '',
        ayon_path: '',
      },
    },
    entity_key: ['task-1'],
  }]);
});

test('blocks rename requests without an explicit existing_id', () => {
  const plan = planHierarchyLevel({
    projectId: 'project-1',
    parentId: 'film-folder',
    parentKind: 'Film',
    entityType: 'Shot',
    nodes: [{ name: 'sh010', rename_to: 'sh020' }],
    existingChildren: [{ id: 'shot-1', name: 'sh010', parent_id: 'film-folder' }],
  });

  assert.equal(plan.operations.length, 0);
  assert.match(plan.errors[0].message, /requires existing_id/);
});

test('blocks existing_id that is not under the queried parent', () => {
  const plan = planHierarchyLevel({
    projectId: 'project-1',
    parentId: 'film-folder',
    parentKind: 'Film',
    entityType: 'Shot',
    nodes: [{ name: 'sh010', existing_id: 'other-shot' }],
    existingChildren: [{ id: 'shot-1', name: 'sh010', parent_id: 'film-folder' }],
  });

  assert.equal(plan.operations.length, 0);
  assert.match(plan.errors[0].message, /out-of-scope write/);
});

test('blocks invalid names and reserved field overrides', () => {
  const invalidNamePlan = planHierarchyLevel({
    projectId: 'project-1',
    parentId: 'film-folder',
    parentKind: 'Film',
    entityType: 'Shot',
    nodes: [{ name: 'shot-010' }],
    existingChildren: [],
  });

  assert.match(invalidNamePlan.errors[0].message, /must match/);
  assert.throws(
    () => sanitizeEntityFields({ parent_id: 'wrong-parent' }),
    /cannot be overridden/
  );
});

test('blocks duplicate desired names in one parent payload', () => {
  const plan = planHierarchyLevel({
    projectId: 'project-1',
    parentId: 'film-folder',
    parentKind: 'Film',
    entityType: 'Shot',
    nodes: [{ name: 'sh010' }, { name: 'sh010' }],
    existingChildren: [],
  });

  assert.equal(plan.operations.length, 1);
  assert.match(plan.errors[0].message, /duplicate desired name/);
});

test('builds native clear custom attributes payload for selected keys', () => {
  assert.deepEqual(buildClearCustomAttributesData(['ayon_id']), {
    custom_attributes: {
      ayon_id: '',
    },
  });
});
