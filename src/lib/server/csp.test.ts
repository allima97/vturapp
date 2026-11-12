import { describe, expect, it } from 'vitest';
import { buildCspPolicy } from './csp';

describe('política de segurança de conteúdo', () => {
  it('permite WebAssembly em produção sem liberar avaliação de JavaScript', () => {
    const policy = buildCspPolicy(false);
    const scripts = policy.split('; ').find((directive) => directive.startsWith('script-src '));
    expect(scripts).toContain("'wasm-unsafe-eval'");
    expect(scripts?.split(' ')).not.toContain("'unsafe-eval'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("object-src 'none'");
  });

  it('preserva as permissões de desenvolvimento', () => {
    expect(buildCspPolicy(true)).toContain("'unsafe-eval'");
  });
});
