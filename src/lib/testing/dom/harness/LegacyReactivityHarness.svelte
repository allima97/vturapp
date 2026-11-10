<!-- Reproduz a armadilha do modo legado: `$: x = fn()` não vê as variáveis usadas dentro de fn(). -->
<script lang="ts">
  export let log: string[];
  let mes = '2026-09';
  function buildKey() {
    return ['mes', mes].join('|');
  }
  $: keyViaFuncao = buildKey();
  $: keyDireta = ['mes', mes].join('|');
  $: log.push(`funcao=${keyViaFuncao} direta=${keyDireta}`);
</script>

<input type="month" bind:value={mes} />
