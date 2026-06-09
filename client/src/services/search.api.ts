import { api } from './http';
import type { ID } from '@/types/domain';

export interface SearchHit {
  id: ID;
  title: string;
  icon: string;
  parentId: ID | null;
  /** Plain-text excerpt around the first content match, or null for title hits. */
  snippet: string | null;
  matchedIn: 'title' | 'content';
}

export const searchApi = {
  query: (q: string) => api<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),
};
