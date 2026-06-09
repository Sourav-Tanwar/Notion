import { useThemeStore } from '../store';

describe('theme store (pure)', () => {
  beforeEach(() => {
    useThemeStore.getState()._reset();
  });

  it('starts at system / dark by default', () => {
    const s = useThemeStore.getState();
    expect(s.pref).toBe('system');
    expect(s.system).toBe('dark');
    expect(s.resolved).toBe('dark');
  });

  it('resolves to the explicit pref regardless of system', () => {
    useThemeStore.getState()._setSystem('light');
    useThemeStore.getState()._setPref('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');

    useThemeStore.getState()._setPref('light');
    expect(useThemeStore.getState().resolved).toBe('light');
  });

  it('resolves to system when pref is "system"', () => {
    useThemeStore.getState()._setPref('system');
    useThemeStore.getState()._setSystem('light');
    expect(useThemeStore.getState().resolved).toBe('light');

    useThemeStore.getState()._setSystem('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');
  });

  it('reacts to system changes only while pref === "system"', () => {
    useThemeStore.getState()._setPref('light');
    useThemeStore.getState()._setSystem('dark');
    // pref pinned to light → resolved stays light
    expect(useThemeStore.getState().resolved).toBe('light');
  });
});
