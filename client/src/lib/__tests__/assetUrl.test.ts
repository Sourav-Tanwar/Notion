import { resolveAssetUrl } from '@/lib/assetUrl';

describe('resolveAssetUrl', () => {
  test('returns null for empty values', () => {
    expect(resolveAssetUrl(null)).toBeNull();
    expect(resolveAssetUrl(undefined)).toBeNull();
    expect(resolveAssetUrl('')).toBeNull();
    expect(resolveAssetUrl('   ')).toBeNull();
  });

  test('passes through absolute http(s) URLs unchanged', () => {
    expect(resolveAssetUrl('http://localhost:4000/uploads/a.jpg')).toBe('http://localhost:4000/uploads/a.jpg');
    expect(resolveAssetUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });

  test('passes through data: and blob: URLs (used by uploaders for previews)', () => {
    expect(resolveAssetUrl('data:image/png;base64,xxx')).toBe('data:image/png;base64,xxx');
    expect(resolveAssetUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });

  test('refuses unsafe schemes', () => {
    // eslint-disable-next-line no-script-url
    expect(resolveAssetUrl('javascript:alert(1)')).toBeNull();
    expect(resolveAssetUrl('file:///etc/passwd')).toBeNull();
  });

  test('joins bare relative paths to origin', () => {
    // With no VITE_API_ORIGIN, returns the path as-is so it uses the SPA origin.
    expect(resolveAssetUrl('/uploads/a.jpg')).toBe('/uploads/a.jpg');
    expect(resolveAssetUrl('uploads/a.jpg')).toBe('/uploads/a.jpg');
  });
});
