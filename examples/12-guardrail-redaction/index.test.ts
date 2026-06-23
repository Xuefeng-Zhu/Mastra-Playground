import { describe, expect, it } from 'vitest';
import { Tracer, type TraceEvent } from '../../shared/tracer';
import {
  finalizeGuardrailRunResult,
  normalizeBlockedGuardrail,
  redactSensitiveText,
  safeEchoInput,
} from './index';

const RAW_VALUES = [
  'ada@example.com',
  '+1 (415) 555-0123',
  '123-45-6789',
  '4242 4242 4242 4242',
  'sk_test_1234567890abcdefABCDEF',
];

describe('guardrail-redaction helpers', () => {
  it('redacts email, phone, SSN, card, and API-key-like values without reporting raw matches', () => {
    const raw = `Email ada@example.com, phone +1 (415) 555-0123, SSN 123-45-6789, card 4242 4242 4242 4242, key sk_test_1234567890abcdefABCDEF.`;
    const result = redactSensitiveText(raw);

    expect(result.redactedMessage).toContain('[EMAIL_1]');
    expect(result.redactedMessage).toContain('[PHONE_1]');
    expect(result.redactedMessage).toContain('[SSN_1]');
    expect(result.redactedMessage).toContain('[CARD_1]');
    expect(result.redactedMessage).toContain('[API_KEY_1]');
    expect(result.detections).toMatchObject({ email: 1, phone: 1, ssn: 1, card: 1, api_key: 1 });
    for (const value of RAW_VALUES) {
      expect(result.redactedMessage).not.toContain(value);
      expect(JSON.stringify(result.detections)).not.toContain(value);
    }
  });

  it('builds a safe input echo for start and done traces', () => {
    const safe = safeEchoInput({
      message: 'My email is ada@example.com and my key is sk_test_1234567890abcdefABCDEF',
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
    });

    expect(safe).toEqual({
      message: '[REDACTED_USER_MESSAGE]',
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
    });
    expect(JSON.stringify(safe)).not.toContain('ada@example.com');
    expect(JSON.stringify(safe)).not.toContain('sk_test_1234567890abcdefABCDEF');
  });

  it('does not require raw sensitive values in emitted trace payloads', () => {
    const events: TraceEvent[] = [];
    const tracer = new Tracer();
    tracer.subscribe((event) => events.push(event));
    const safe = safeEchoInput({ message: 'Call +1 (415) 555-0123' });

    tracer.emit({ type: 'start', workflow: 'guardrail-redaction', input: safe, steps: [] });
    tracer.emit({
      type: 'done',
      status: 'success',
      output: redactSensitiveText('Call +1 (415) 555-0123'),
      totalMs: 1,
    });

    const serialized = JSON.stringify(events);
    expect(serialized).toContain('[REDACTED_USER_MESSAGE]');
    expect(serialized).toContain('[PHONE_1]');
    expect(serialized).not.toContain('+1 (415) 555-0123');
  });

  it('does not stringify raw workflow input when a downstream LLM step fails', () => {
    const events: TraceEvent[] = [];
    const tracer = new Tracer();
    tracer.subscribe((event) => events.push(event));
    const safe = safeEchoInput({ message: 'Email ada@example.com' });

    const result = {
      status: 'failed',
      steps: {
        input: { message: 'Email ada@example.com' },
        classify: { error: { message: 'provider unavailable' } },
      },
      input: { message: 'Email ada@example.com' },
    };

    const finalized = finalizeGuardrailRunResult(result, tracer, Date.now(), safe);
    const serialized = JSON.stringify({ finalized, events });

    expect(serialized).toContain('provider unavailable');
    expect(serialized).toContain('[REDACTED_USER_MESSAGE]');
    expect(serialized).not.toContain('ada@example.com');
  });

  it('normalizes the guardrail decision when deterministic high-risk detection forces a block', () => {
    const guardrail = normalizeBlockedGuardrail(
      {
        allowed: true,
        risk: 'low',
        policyTags: [],
        reason: 'The redacted request looks harmless.',
      },
      { ssn: 1 },
    );

    expect(guardrail).toEqual({
      allowed: false,
      risk: 'high',
      policyTags: ['pii_or_secret'],
      reason: 'Sensitive high-risk data was detected and removed before model processing.',
    });
  });
});
