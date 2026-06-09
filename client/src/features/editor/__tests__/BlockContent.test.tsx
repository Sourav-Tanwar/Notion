import { render, screen, fireEvent } from '@testing-library/react';
import { BlockContent } from '@/features/editor/BlockContent';
import { createRef } from 'react';

describe('BlockContent', () => {
  test('renders placeholder when empty', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <BlockContent
        ref={ref}
        type="text"
        text=""
        onInput={() => undefined}
        onKeyDown={() => undefined}
      />,
    );
    const editable = screen.getByRole('textbox');
    expect(editable).toHaveAttribute('data-empty', 'true');
  });

  test('renders heading classes for heading type', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <BlockContent
        ref={ref}
        type="heading"
        text="Hi"
        onInput={() => undefined}
        onKeyDown={() => undefined}
      />,
    );
    expect(screen.getByRole('textbox').className).toMatch(/text-2xl/);
  });

  test('todo toggle invokes callback', () => {
    const ref = createRef<HTMLDivElement>();
    const onToggle = jest.fn();
    render(
      <BlockContent
        ref={ref}
        type="todo"
        text="task"
        checked={false}
        onInput={() => undefined}
        onKeyDown={() => undefined}
        onToggleCheck={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalled();
  });
});
