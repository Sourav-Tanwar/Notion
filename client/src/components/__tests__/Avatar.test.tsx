import { render, screen } from '@testing-library/react';
import { Avatar } from '@/components/Avatar';

const baseUser = {
  id: 'u1',
  email: 'alice@example.com',
  emailVerified: true,
  name: 'Alice',
  username: null,
  bio: '',
  avatarUrl: null as string | null,
  role: 'user' as const,
  themePref: 'system' as const,
  hasPassword: true,
};

describe('Avatar', () => {
  test('renders initials when no avatar URL', () => {
    render(<Avatar user={baseUser} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  test('renders image when avatarUrl is absolute', () => {
    render(<Avatar user={{ ...baseUser, avatarUrl: 'https://cdn.example.com/a.jpg' }} />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/a.jpg');
  });

  test('falls back to ? for null user', () => {
    render(<Avatar user={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
