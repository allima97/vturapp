<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  // Conciliação operacional redireciona para o módulo financeiro
  onMount(() => goto('/financeiro/conciliacao'));
</script>
