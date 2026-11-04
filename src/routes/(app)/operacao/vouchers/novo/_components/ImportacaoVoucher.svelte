<script lang="ts">
  import { Button, FieldTextarea } from '$lib/components/ui';
  import { ChevronDown } from '$lib/icons';

  export let travelPasteText: string;
  export let circuitPasteText: string;
  export let hotelPasteText: string;
  export let importingTravel: boolean;
  export let importingCircuit: boolean;
  export let importingHotels: boolean;
  export let importingFile: boolean;
  export let importedFileName: string;
  export let importAccordion: string[];
  export let importTravelFromPaste: () => Promise<void>;
  export let importItineraryFromPaste: () => Promise<void>;
  export let importHotelsFromPasteUnified: () => Promise<void>;
  export let importFromFile: (file: File) => Promise<void>;
  export let toggleImportAccordion: (key: string) => void;

  let importFileInput: HTMLInputElement | null = null;
</script>

<div class="rounded-xl border border-slate-200 bg-slate-50 p-5">
  <h3 class="mb-2 font-semibold text-slate-900">Importar dados do voucher</h3>
  <p class="mb-4 text-sm text-slate-600">
    Cole cada parte do voucher na caixa correspondente ou importe por arquivo.
  </p>

  <input
    bind:this={importFileInput}
    type="file"
    class="hidden"
    accept=".docx,.pdf,.txt"
    on:change={async (e) => {
      const file = (e.currentTarget as HTMLInputElement).files?.[0];
      (e.currentTarget as HTMLInputElement).value = '';
      if (!file) return;
      await importFromFile(file);
    }}
  />

  <div class="space-y-2">
    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <Button
        type="button"
        variant="ghost"
        class_name="w-full justify-between! rounded-none! px-4! py-4!"
        on:click={() => toggleImportAccordion('viagem')}
      >
        <span>Colar dados da viagem</span>
        <ChevronDown
          size={16}
          class={importAccordion.includes('viagem')
            ? 'rotate-180 transition-transform'
            : 'transition-transform'}
        />
      </Button>
      {#if importAccordion.includes('viagem')}
        <div class="space-y-3 border-t border-slate-100 p-4">
          <FieldTextarea
            bind:value={travelPasteText}
            rows={8}
            placeholder="Cole dados da viagem, passageiros e informações principais..."
          />
          <div class="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              on:click={importTravelFromPaste}
              disabled={importingTravel}
            >
              {importingTravel ? 'Importando...' : 'Importar dados da viagem'}
            </Button>
            {#if travelPasteText}
              <Button variant="ghost" size="sm" on:click={() => (travelPasteText = '')}
                >Limpar</Button
              >
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <Button
        type="button"
        variant="ghost"
        class_name="w-full justify-between! rounded-none! px-4! py-4!"
        on:click={() => toggleImportAccordion('itinerario')}
      >
        <span>Colar itinerário</span>
        <ChevronDown
          size={16}
          class={importAccordion.includes('itinerario')
            ? 'rotate-180 transition-transform'
            : 'transition-transform'}
        />
      </Button>
      {#if importAccordion.includes('itinerario')}
        <div class="space-y-3 border-t border-slate-100 p-4">
          <FieldTextarea
            bind:value={circuitPasteText}
            rows={8}
            placeholder="Cole o itinerário dia a dia..."
          />
          <div class="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              on:click={importItineraryFromPaste}
              disabled={importingCircuit}
            >
              {importingCircuit ? 'Importando...' : 'Importar itinerário'}
            </Button>
            {#if circuitPasteText}
              <Button variant="ghost" size="sm" on:click={() => (circuitPasteText = '')}
                >Limpar</Button
              >
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <Button
        type="button"
        variant="ghost"
        class_name="w-full justify-between! rounded-none! px-4! py-4!"
        on:click={() => toggleImportAccordion('hoteis')}
      >
        <span>Colar lista de hotéis</span>
        <ChevronDown
          size={16}
          class={importAccordion.includes('hoteis')
            ? 'rotate-180 transition-transform'
            : 'transition-transform'}
        />
      </Button>
      {#if importAccordion.includes('hoteis')}
        <div class="space-y-3 border-t border-slate-100 p-4">
          <FieldTextarea
            bind:value={hotelPasteText}
            rows={8}
            placeholder="Cole a lista de hotéis..."
          />
          <div class="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              on:click={importHotelsFromPasteUnified}
              disabled={importingHotels}
            >
              {importingHotels ? 'Importando...' : 'Importar hotéis'}
            </Button>
            {#if hotelPasteText}
              <Button variant="ghost" size="sm" on:click={() => (hotelPasteText = '')}
                >Limpar</Button
              >
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="mt-4 flex items-center gap-3">
    <Button variant="primary" on:click={() => importFileInput?.click()} disabled={importingFile}>
      {importingFile ? 'Importando arquivo...' : 'Importar arquivo'}
    </Button>
    <span class="text-sm text-slate-600">{importedFileName || 'Nenhum arquivo selecionado'}</span>
  </div>
  <p class="mt-2 text-xs text-slate-500">
    Escolha o arquivo Word (.docx), PDF ou texto (.txt) e importe tudo de uma vez.
  </p>
</div>
