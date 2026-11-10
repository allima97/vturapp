<!--
  Fase 4.3: faz um ícone do flowbite-svelte-icons aceitar as mesmas props do Lucide
  (`size` em px, `strokeWidth`, `color`, `class`), com o mesmo tamanho de caixa:
  - `size` numérico vira width/height (como no Lucide); classes w-*/h-* do chamador continuam valendo;
  - o `size` do Flowbite (w-5 h-5 etc.) é desligado;
  - o Flowbite acrescenta `shrink-0`; `shrink` desfaz isso (o Lucide não impede o ícone de encolher).
-->
<script lang="ts">
  import type { Component } from 'svelte';

  type Props = {
    icon: Component<any>;
    size?: number | string;
    strokeWidth?: number | string;
    color?: string;
    class?: string;
    [key: string]: unknown;
  };

  let {
    icon: Icon,
    size = 24,
    strokeWidth = 2,
    color = 'currentColor',
    class: className = '',
    ...rest
  }: Props = $props();
</script>

<Icon
  {...rest}
  size={'none' as any}
  width={size}
  height={size}
  {color}
  {strokeWidth}
  class={`shrink ${className}`.trim()}
/>
