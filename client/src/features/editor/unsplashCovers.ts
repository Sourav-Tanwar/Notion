/**
 * A small curated gallery of Unsplash cover photos. Each entry is a direct
 * images.unsplash.com URL (no API key needed) sized for a page banner.
 * Selecting one stores its URL as the page's coverUrl.
 */
export interface CoverPhoto {
  /** Thumbnail (small) URL for the picker grid. */
  thumb: string;
  /** Full-size URL stored as the cover. */
  full: string;
}

const IDS = [
  'photo-1506744038136-46273834b3fb',
  'photo-1419242902214-272b3f66ee7a',
  'photo-1469474968028-56623f02e42e',
  'photo-1470071459604-3b5ec3a7fe05',
  'photo-1447752875215-b2761acb3c5d',
  'photo-1426604966848-d7adac402bff',
  'photo-1441974231531-c6227db76b6e',
  'photo-1500534623283-312aade485b7',
  'photo-1518173946687-a4c8892bbd9f',
  'photo-1472214103451-9374bd1c798e',
  'photo-1497436072909-60f360e1d4b1',
  'photo-1433086966358-54859d0ed716',
];

const base = (id: string, w: number): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const UNSPLASH_COVERS: CoverPhoto[] = IDS.map((id) => ({
  thumb: base(id, 280),
  full: base(id, 1500),
}));
