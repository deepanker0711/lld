import {
  extractVariables,
  findMissingVariables,
  renderTemplate,
} from './template-renderer';

describe('template renderer', () => {
  it('extracts unique variables in order, across subject and body, tolerating spaces', () => {
    expect(
      extractVariables(
        'Leave {{ from }}',
        'Hi {{name}}, from {{from}} to {{to}}',
      ),
    ).toEqual(['from', 'name', 'to']);
  });

  it('ignores things that are not valid placeholders', () => {
    expect(
      extractVariables(
        '{{name',
        '{{ 1x }}',
        '{name}',
        '{{first-name}}',
        'plain',
      ),
    ).toEqual([]);
  });

  it('renders every occurrence', () => {
    expect(
      renderTemplate('Hi {{name}}! Bye {{ name }}.', { name: 'Asha' }),
    ).toBe('Hi Asha! Bye Asha.');
  });

  it('stringifies non-string values, and 0/false/"" are valid values', () => {
    expect(
      renderTemplate('{{n}} {{ok}} [{{s}}]', { n: 0, ok: false, s: '' }),
    ).toBe('0 false []');
    expect(
      findMissingVariables(['n', 'ok', 's'], { n: 0, ok: false, s: '' }),
    ).toEqual([]);
  });

  it('reports null and undefined as missing', () => {
    expect(
      findMissingVariables(['name', 'from', 'to'], {
        name: 'Asha',
        from: null,
      }),
    ).toEqual(['from', 'to']);
  });

  it('does not expand placeholders that appear inside values', () => {
    expect(
      renderTemplate('Hi {{name}}', { name: '{{secret}}', secret: 'leaked' }),
    ).toBe('Hi {{secret}}');
  });

  it('throws if asked to render with a missing variable', () => {
    expect(() => renderTemplate('Hi {{name}}', {})).toThrow(
      "Missing template variable 'name'",
    );
  });

  it('leaves extra data keys unused', () => {
    expect(renderTemplate('Hi', { name: 'x' })).toBe('Hi');
  });
});
