import { act } from '@testing-library/react';
import { useBlocksStore } from '@/stores/blocks.store';

jest.mock('@/services/blocks.api', () => ({
  blocksApi: {
    listByPage: jest.fn().mockResolvedValue([]),
    upsertMany: jest.fn().mockResolvedValue({ ok: true }),
    deleteMany: jest.fn().mockResolvedValue({ ok: true }),
    reorder: jest.fn().mockResolvedValue({ ok: true }),
  },
}));

const PAGE = 'page-1';

beforeEach(() => {
  useBlocksStore.setState({
    byId: {},
    childrenOf: {},
    rootByPage: {},
    loadedPages: new Set(),
    dirty: new Set(),
    deletedBuffer: new Set(),
  });
});

describe('blocks.store', () => {
  test('insertFirst creates a top-level block on a page', () => {
    const id = useBlocksStore.getState().insertFirst(PAGE, 'text');
    const s = useBlocksStore.getState();
    expect(s.rootByPage[PAGE]).toEqual([id]);
    expect(s.byId[id].type).toBe('text');
    expect(s.dirty.has(id)).toBe(true);
  });

  test('insertAfter inserts in correct order and reindexes siblings', () => {
    const a = useBlocksStore.getState().insertFirst(PAGE, 'text');
    const b = useBlocksStore.getState().insertAfter(a, 'text');
    const c = useBlocksStore.getState().insertAfter(a, 'text');
    const s = useBlocksStore.getState();
    expect(s.rootByPage[PAGE]).toEqual([a, c, b]);
    expect(s.byId[a].order).toBe(1);
    expect(s.byId[c].order).toBe(2);
    expect(s.byId[b].order).toBe(3);
  });

  test('setText is optimistic and marks dirty', () => {
    const id = useBlocksStore.getState().insertFirst(PAGE, 'text');
    act(() => useBlocksStore.getState().setText(id, 'hello'));
    expect(useBlocksStore.getState().byId[id].text).toBe('hello');
    expect(useBlocksStore.getState().dirty.has(id)).toBe(true);
  });

  test('removeBlock returns focus target and cascades children', () => {
    const a = useBlocksStore.getState().insertFirst(PAGE, 'text');
    const b = useBlocksStore.getState().insertAfter(a, 'text');
    const focus = useBlocksStore.getState().removeBlock(b);
    expect(focus).toBe(a);
    expect(useBlocksStore.getState().byId[b]).toBeUndefined();
    expect(useBlocksStore.getState().deletedBuffer.has(b)).toBe(true);
  });

  test('reorder moves a block within siblings', () => {
    const a = useBlocksStore.getState().insertFirst(PAGE, 'text');
    const b = useBlocksStore.getState().insertAfter(a, 'text');
    const c = useBlocksStore.getState().insertAfter(b, 'text');
    useBlocksStore.getState().reorder(c, null, 0, PAGE);
    expect(useBlocksStore.getState().rootByPage[PAGE]).toEqual([c, a, b]);
  });
});
