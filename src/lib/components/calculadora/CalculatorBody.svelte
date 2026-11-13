<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';

  type CalculatorKey = {
    label: string;
    action: 'clear' | 'toggle_sign' | 'append' | 'evaluate';
    value?: string;
    gridColumn: string;
    gridRow: string;
    variant: 'danger' | 'function' | 'operator' | 'number';
  };

  const calculatorKeys: CalculatorKey[] = [
    { label: 'AC', action: 'clear', gridColumn: '1', gridRow: '1', variant: 'danger' },
    { label: '+/-', action: 'toggle_sign', gridColumn: '2', gridRow: '1', variant: 'function' },
    {
      label: '%',
      action: 'append',
      value: '%',
      gridColumn: '3',
      gridRow: '1',
      variant: 'function'
    },
    {
      label: '/',
      action: 'append',
      value: '/',
      gridColumn: '4',
      gridRow: '1',
      variant: 'operator'
    },
    { label: '7', action: 'append', value: '7', gridColumn: '1', gridRow: '2', variant: 'number' },
    { label: '8', action: 'append', value: '8', gridColumn: '2', gridRow: '2', variant: 'number' },
    { label: '9', action: 'append', value: '9', gridColumn: '3', gridRow: '2', variant: 'number' },
    {
      label: 'x',
      action: 'append',
      value: 'x',
      gridColumn: '4',
      gridRow: '2',
      variant: 'operator'
    },
    { label: '4', action: 'append', value: '4', gridColumn: '1', gridRow: '3', variant: 'number' },
    { label: '5', action: 'append', value: '5', gridColumn: '2', gridRow: '3', variant: 'number' },
    { label: '6', action: 'append', value: '6', gridColumn: '3', gridRow: '3', variant: 'number' },
    {
      label: '-',
      action: 'append',
      value: '-',
      gridColumn: '4',
      gridRow: '3',
      variant: 'operator'
    },
    { label: '1', action: 'append', value: '1', gridColumn: '1', gridRow: '4', variant: 'number' },
    { label: '2', action: 'append', value: '2', gridColumn: '2', gridRow: '4', variant: 'number' },
    { label: '3', action: 'append', value: '3', gridColumn: '3', gridRow: '4', variant: 'number' },
    {
      label: '+',
      action: 'append',
      value: '+',
      gridColumn: '4',
      gridRow: '4',
      variant: 'operator'
    },
    {
      label: '0',
      action: 'append',
      value: '0',
      gridColumn: '1 / span 2',
      gridRow: '5',
      variant: 'number'
    },
    { label: ',', action: 'append', value: '.', gridColumn: '3', gridRow: '5', variant: 'number' },
    { label: '=', action: 'evaluate', gridColumn: '4', gridRow: '5', variant: 'operator' }
  ];

  type Token =
    | { type: 'number'; value: number }
    | { type: 'op'; value: '+' | '-' | '*' | '/' }
    | { type: 'percent' }
    | { type: 'paren'; value: '(' | ')' };

  const OPERATOR_KEYS = new Set(['+', '-', '*', '/', 'x', 'X']);

  let calcValue = '0';
  let calcError: string | null = null;
  let calcInput: HTMLInputElement | null = null;

  function sanitizeCalcInput(value: string) {
    return value.replace(/,/g, '.').replace(/[^0-9+\-*/().x%\s]/gi, '');
  }

  function normalizeCalcNumberToken(token: string) {
    if (!token) return '';
    let normalized = token;
    if (normalized.startsWith('.') || normalized.startsWith(',')) {
      normalized = `0${normalized}`;
    }
    if (normalized.includes(',')) {
      const [intPart, ...decParts] = normalized.split(',');
      const integer = intPart.replace(/\./g, '');
      const decimal = decParts.join('').replace(/\./g, '');
      return decimal.length ? `${integer}.${decimal}` : `${integer}.`;
    }
    const dotCount = (normalized.match(/\./g) || []).length;
    if (dotCount > 1) {
      return normalized.replace(/\./g, '');
    }
    if (dotCount === 1) {
      const [intPart, decPart] = normalized.split('.');
      if (decPart.length === 3 && intPart.length > 0) {
        return `${intPart}${decPart}`;
      }
      return `${intPart}.${decPart}`;
    }
    return normalized;
  }

  function normalizeCalcDisplayInput(value: string) {
    const cleaned = value.replace(/[^0-9+\-*/().,%x\s]/gi, '');
    let result = '';
    let currentNumber = '';
    const flushNumber = () => {
      if (!currentNumber) return;
      result += normalizeCalcNumberToken(currentNumber);
      currentNumber = '';
    };

    for (let i = 0; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (/[0-9.,]/.test(ch)) {
        currentNumber += ch;
        continue;
      }
      flushNumber();
      if (/[+\-*/()%x\s()]/i.test(ch)) {
        result += ch.toLowerCase() === 'x' ? 'x' : ch;
      }
    }

    flushNumber();
    return result;
  }

  function formatCalcResult(value: number) {
    if (!Number.isFinite(value)) return '0';
    if (Number.isInteger(value)) return String(value);
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded.toFixed(2);
  }

  function formatCalcDisplay(value: string) {
    if (!value) return '';
    return value.replace(/(\d+(?:\.\d*)?|\.\d+)/g, (match) => {
      let [intPart, decPart] = match.split('.');
      if (!intPart) intPart = '0';
      const normalizedInt = intPart.replace(/^0+(?=\d)/, '');
      const baseInt = normalizedInt || '0';
      const formattedInt = baseInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      if (decPart !== undefined) {
        return `${formattedInt},${decPart}`;
      }
      return formattedInt;
    });
  }

  function appendCalcValue(value: string) {
    calcError = null;
    calcValue = (() => {
      if (calcValue === '0' && /[0-9]/.test(value)) return value;
      if (calcValue === '0' && value === '.') return '0.';
      return calcValue + value;
    })();
  }

  function backspaceCalc() {
    calcError = null;
    if (calcValue.length <= 1) {
      calcValue = '0';
      return;
    }
    const next = calcValue.slice(0, -1);
    calcValue = next === '-' ? '0' : next;
  }

  function clearCalc() {
    calcError = null;
    calcValue = '0';
  }

  function toggleSign() {
    calcError = null;
    const trimmed = calcValue.trim();
    if (!trimmed || trimmed === '0') {
      calcValue = '0';
      return;
    }
    let end = trimmed.length - 1;
    while (end >= 0 && !/[0-9.]/.test(trimmed[end])) end -= 1;
    if (end < 0) return;
    let start = end;
    while (start >= 0 && /[0-9.]/.test(trimmed[start])) start -= 1;
    start += 1;
    let signIndex = start - 1;
    while (signIndex >= 0 && trimmed[signIndex] === ' ') signIndex -= 1;
    if (signIndex >= 0 && trimmed[signIndex] === '-') {
      let before = signIndex - 1;
      while (before >= 0 && trimmed[before] === ' ') before -= 1;
      if (before < 0 || /[+\-*/(]/.test(trimmed[before])) {
        calcValue = trimmed.slice(0, signIndex) + trimmed.slice(signIndex + 1);
        return;
      }
    }
    calcValue = trimmed.slice(0, start) + '-' + trimmed.slice(start);
  }

  function tokenizeExpression(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (ch === ' ' || ch === '\t' || ch === '\n') {
        i += 1;
        continue;
      }
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        let num = ch;
        i += 1;
        while (i < input.length && ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')) {
          num += input[i];
          i += 1;
        }
        const value = Number(num);
        tokens.push({ type: 'number', value: Number.isFinite(value) ? value : 0 });
        continue;
      }
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        tokens.push({ type: 'op', value: ch });
        i += 1;
        continue;
      }
      if (ch === '(' || ch === ')') {
        tokens.push({ type: 'paren', value: ch });
        i += 1;
        continue;
      }
      if (ch === '%') {
        tokens.push({ type: 'percent' });
        i += 1;
        continue;
      }
      i += 1;
    }
    return tokens;
  }

  function parseFactor(tokens: Token[], indexRef: { index: number }, base: number | null): number {
    if (indexRef.index >= tokens.length) return 0;
    const token = tokens[indexRef.index];
    if (token.type === 'op' && (token.value === '+' || token.value === '-')) {
      indexRef.index += 1;
      const next = parseFactor(tokens, indexRef, base);
      return token.value === '-' ? -next : next;
    }
    let value = 0;
    if (token.type === 'number') {
      value = token.value;
      indexRef.index += 1;
    } else if (token.type === 'paren' && token.value === '(') {
      indexRef.index += 1;
      value = parseExpression(tokens, indexRef, base);
      const currentToken = tokens[indexRef.index];
      if (currentToken?.type === 'paren' && currentToken.value === ')') {
        indexRef.index += 1;
      }
    } else {
      indexRef.index += 1;
    }
    if (tokens[indexRef.index]?.type === 'percent') {
      indexRef.index += 1;
      value = base !== null ? (base * value) / 100 : value / 100;
    }
    return value;
  }

  function parseTerm(tokens: Token[], indexRef: { index: number }, base: number | null): number {
    let value = parseFactor(tokens, indexRef, base);
    while (indexRef.index < tokens.length) {
      const token = tokens[indexRef.index];
      if (token.type === 'op' && (token.value === '*' || token.value === '/')) {
        indexRef.index += 1;
        const right = parseFactor(tokens, indexRef, null);
        value = token.value === '*' ? value * right : value / right;
        continue;
      }
      break;
    }
    return value;
  }

  function parseExpression(
    tokens: Token[],
    indexRef: { index: number },
    base: number | null
  ): number {
    let value = parseTerm(tokens, indexRef, base);
    while (indexRef.index < tokens.length) {
      const token = tokens[indexRef.index];
      if (token.type === 'op' && (token.value === '+' || token.value === '-')) {
        indexRef.index += 1;
        const right = parseTerm(tokens, indexRef, value);
        value = token.value === '+' ? value + right : value - right;
        continue;
      }
      break;
    }
    return value;
  }

  function evaluateExpression(input: string): number | null {
    const tokens = tokenizeExpression(input);
    if (!tokens.length) return 0;
    const indexRef = { index: 0 };
    const result = parseExpression(tokens, indexRef, null);
    return Number.isFinite(result) ? result : null;
  }

  function evaluateCalc() {
    const expr = sanitizeCalcInput(calcValue).trim().replace(/x/gi, '*');
    if (!expr) {
      calcError = null;
      calcValue = '0';
      return;
    }
    const result = evaluateExpression(expr);
    if (result === null || Number.isNaN(result) || !Number.isFinite(result)) {
      calcError = 'Expressão inválida.';
      return;
    }
    calcError = null;
    calcValue = formatCalcResult(result);
  }

  function handleDisplayInput(event: Event) {
    calcError = null;
    calcValue = normalizeCalcDisplayInput((event.currentTarget as HTMLInputElement).value);
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName || '';
    const isEditable =
      tagName === 'INPUT' || tagName === 'TEXTAREA' || Boolean(target?.isContentEditable);

    if (event.key === 'Enter') {
      event.preventDefault();
      evaluateCalc();
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      backspaceCalc();
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      clearCalc();
      return;
    }

    if (event.key.toLowerCase() === 'c' && !isEditable) {
      event.preventDefault();
      clearCalc();
      return;
    }

    if (/[0-9]/.test(event.key)) {
      event.preventDefault();
      appendCalcValue(event.key);
      return;
    }

    if (event.key === '.' || event.key === ',') {
      event.preventDefault();
      appendCalcValue('.');
      return;
    }

    if (OPERATOR_KEYS.has(event.key)) {
      event.preventDefault();
      appendCalcValue(event.key === '*' ? 'x' : event.key.toLowerCase());
      return;
    }

    if (event.key === '%') {
      event.preventDefault();
      appendCalcValue('%');
      return;
    }

    if (event.key === 'F9') {
      event.preventDefault();
      toggleSign();
    }
  }

  function handleCalculatorAction(key: CalculatorKey) {
    if (key.action === 'clear') {
      clearCalc();
      return;
    }
    if (key.action === 'toggle_sign') {
      toggleSign();
      return;
    }
    if (key.action === 'evaluate') {
      evaluateCalc();
      return;
    }
    if (key.action === 'append' && key.value) {
      appendCalcValue(key.value);
    }
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div class="mx-auto flex w-full max-w-md flex-col gap-3">
  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xs">
    <div class="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
      <input
        bind:this={calcInput}
        type="text"
        value={formatCalcDisplay(calcValue)}
        on:input={handleDisplayInput}
        on:keydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            evaluateCalc();
          }
        }}
        class="w-full border-0 bg-transparent text-right text-[clamp(1.6rem,6vw,2.1rem)] font-semibold tracking-tight text-slate-900 outline-hidden"
        aria-label="Calculadora"
      />
    </div>

    {#if calcError}
      <div class="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {calcError}
      </div>
    {/if}

    <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
      <div
        class="calculator-keys grid gap-2 bg-transparent"
        style="grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(5, clamp(42px, 8vw, 52px));"
      >
        {#each calculatorKeys as key}
          {@const buttonClass =
            key.variant === 'operator'
              ? 'border-vendas-200 bg-vendas-50 text-vendas-700 hover:bg-vendas-100'
              : key.variant === 'danger'
                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : key.variant === 'function'
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'}
          <Button
            type="button"
            variant="unstyled"
            on:click={() => handleCalculatorAction(key)}
            class_name={`flex items-center justify-center rounded-xl border font-semibold shadow-xs transition-colors ${buttonClass}`}
            style={`grid-column: ${key.gridColumn}; grid-row: ${key.gridRow}; font-size: ${key.label.length > 2 ? 'clamp(0.76rem, 2.2vw, 0.88rem)' : 'clamp(0.95rem, 2.8vw, 1.05rem)'};`}
          >
            {key.label}
          </Button>
        {/each}
      </div>
    </div>

    <div
      class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-xs"
    >
      Use o teclado ou os botões. <code>Enter</code> calcula, <code>Backspace</code> apaga,
      <code>Delete</code>
      limpa e <code>F9</code> inverte o sinal.
    </div>
  </div>

  <div class="flex flex-col gap-2 sm:flex-row sm:justify-between">
    <Button variant="ghost" on:click={clearCalc}>Limpar</Button>
    <Button variant="primary" color="vendas" on:click={evaluateCalc}>Calcular</Button>
  </div>
</div>

<style>
  @media (max-width: 639px) {
    .calculator-keys {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-rows: none !important;
    }

    .calculator-keys :global(.vtur-button) {
      grid-column: auto !important;
      grid-row: auto !important;
      min-height: 44px;
      width: 100%;
    }
  }
</style>
