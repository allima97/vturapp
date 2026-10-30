<script lang="ts" generics="T extends object">
  import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Search,
    Filter,
    Download,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
  } from '$lib/icons';
  import Button from "./Button.svelte";
  import Checkbox from "./Checkbox.svelte";
  import BottomSheet from "./BottomSheet.svelte";
  import FieldInput from "./form/FieldInput.svelte";
  import FieldSelect from "./form/FieldSelect.svelte";
  import SanitizedHtml from "./SanitizedHtml.svelte";
  import { uniqueFieldId } from "./form/fieldId";
  import type { ModuleColor } from "$lib/theme/colors";
  import type { ComponentType } from "svelte";
  import Card from './Card.svelte';

  type SortDirection = "asc" | "desc" | null;
  type RowKey = string;
  type DataTableRow = Record<string, unknown>;

  interface Column<TRow = T> {
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
    align?: "left" | "center" | "right";
    headerClass?: string;
    cellClass?: string;
    formatter?: (value: never, row: TRow) => string;
    component?: ComponentType;
    componentProps?: (row: TRow) => Record<string, unknown>;
  }

  interface FilterOption {
    key: string;
    label: string;
    type: "text" | "select" | "date" | "date-range";
    options?: { value: string; label: string }[];
  }

  function getRowRecord(row: T): DataTableRow {
    return row as DataTableRow;
  }

  function defaultKeyExtractor(row: T): string {
    const rowRecord = getRowRecord(row);
    const directKey =
      rowRecord.id ??
      rowRecord.uuid ??
      rowRecord._id ??
      rowRecord.key ??
      rowRecord.vendedor_id ??
      rowRecord.cliente_id ??
      rowRecord.numero_recibo;

    if (directKey != null && String(directKey).trim() !== "") {
      return String(directKey);
    }

    // Fallback determinístico para evitar chaves voláteis no #each.
    return JSON.stringify(rowRecord);
  }

  function normalizeSearchText(value: unknown) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  export let data: T[] = [];
  export let columns: Column<T>[] = [];
  export let color: ModuleColor = "clientes";
  $: color;
  export let loading: boolean = false;
  export let loadingTitle: string = "Carregando registros";
  export let loadingMessage: string =
    "Aguarde enquanto o sistema busca os dados da tabela.";
  export let selectable: boolean = false;
  export let searchable: boolean = true;
  export let filterable: boolean = true;
  export let exportable: boolean = true;
  export let pagination: boolean = true;
  export let pageSize: number = 10;
  export let pageSizeOptions: number[] = [10, 25, 50, 100];
  export let serverSide: boolean = false;
  export let totalItems: number = 0;
  export let showRowCount: boolean = true;
  export let page: number = 1;
  export let filters: FilterOption[] = [];
  export let title: string = "";
  export let emptyMessage: string = "Nenhum registro encontrado";
  export let keyExtractor: (row: T) => string = defaultKeyExtractor;
  export let rowClass: ((row: T) => string) | undefined = undefined;
  export let compact: boolean = false;
  export let dense: boolean = false;

  export let extraSearchKeys: string[] = [];
  export let onRowClick: ((row: T) => void) | undefined = undefined;
  export let onSelectionChange: ((selected: RowKey[]) => void) | undefined =
    undefined;
  export let onExport: (() => void) | undefined = undefined;
  export let onSearch: ((query: string) => void) | undefined = undefined;
  export let onFilterChange: ((key: string, value: string) => void) | undefined =
    undefined;
  export let onPageChange: ((page: number) => void) | undefined = undefined;
  export let onPageSizeChange: ((pageSize: number) => void) | undefined =
    undefined;
  export let onSortChange:
    | ((key: string | null, direction: SortDirection) => void)
    | undefined = undefined;

  let searchQuery = "";
  let activeFilters: Record<string, string> = {};
  let showFilters = false;
  let showFilterSheet = false;
  let currentPage = 1;
  let currentPageSize = pageSize;
  let sortKey: string | null = null;
  let sortDirection: SortDirection = null;
  let selectedRows: Set<string> = new Set();
  let selectAll = false;
  let lastEmittedSearchQuery = searchQuery;
  const skeletonWidths = ["w-32", "w-24", "w-40", "w-20", "w-28", "w-36"];
  // Fase 5.2 (acessibilidade): liga o botão "Filtros" ao painel que ele abre.
  const filterPanelId = `${uniqueFieldId("datatable")}-filtros`;

  $: if (serverSide && page !== currentPage) {
    currentPage = Math.max(1, Number(page) || 1);
  }

  $: if (serverSide && pageSize !== currentPageSize) {
    currentPageSize = Number(pageSize) || currentPageSize;
  }

  $: filteredData = (() => {
    if (serverSide) return data;

    let result = data;

    if (searchQuery) {
      const query = normalizeSearchText(searchQuery);
      const searchableKeys = [
        ...columns.map((column) => column.key),
        ...extraSearchKeys,
      ];
      result = result.filter((row) => {
        const rowRecord = getRowRecord(row);
        return searchableKeys.some((key) => {
          const value = rowRecord[key];
          if (value == null) return false;
          return normalizeSearchText(value).includes(query);
        });
      });
    }

    for (const [key, value] of Object.entries(activeFilters)) {
      if (value === "" || value == null) continue;
      const normalizedFilter = normalizeSearchText(value);
      result = result.filter((row) => {
        const rowValue = getRowRecord(row)[key];
        return normalizeSearchText(rowValue).includes(normalizedFilter);
      });
    }

    if (sortKey && sortDirection) {
      result = [...result].sort((a, b) => {
        const aVal = getRowRecord(a)[sortKey!];
        const bVal = getRowRecord(b)[sortKey!];

        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortDirection === "asc" ? -1 : 1;
        if (bVal == null) return sortDirection === "asc" ? 1 : -1;

        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();

        if (sortDirection === "asc") {
          return aStr.localeCompare(bStr);
        }
        return bStr.localeCompare(aStr);
      });
    }

    return result;
  })();

  $: totalRecords = serverSide
    ? Math.max(0, Number(totalItems) || 0)
    : filteredData.length;
  $: totalPages = Math.max(1, Math.ceil(totalRecords / currentPageSize));
  $: paginatedData = pagination
    ? serverSide
      ? filteredData
      : filteredData.slice(
          (currentPage - 1) * currentPageSize,
          currentPage * currentPageSize,
        )
    : filteredData;

  $: startIndex = (currentPage - 1) * currentPageSize + 1;
  $: endIndex = serverSide
    ? Math.min(
        (currentPage - 1) * currentPageSize + paginatedData.length,
        totalRecords,
      )
    : Math.min(currentPage * currentPageSize, totalRecords);

  $: if (searchQuery !== lastEmittedSearchQuery) {
    lastEmittedSearchQuery = searchQuery;
    currentPage = 1;
    onSearch?.(searchQuery);
  }

  function handleSort(column: Column) {
    if (!column.sortable) return;

    if (sortKey === column.key) {
      if (sortDirection === "asc") {
        sortDirection = "desc";
      } else if (sortDirection === "desc") {
        sortDirection = null;
        sortKey = null;
      } else {
        sortDirection = "asc";
      }
    } else {
      sortKey = column.key;
      sortDirection = "asc";
    }

    if (serverSide) {
      currentPage = 1;
      onSortChange?.(sortKey, sortDirection);
      onPageChange?.(1);
    }
  }

  function toggleSelectAll() {
    selectAll = !selectAll;
    if (selectAll) {
      for (const row of paginatedData) selectedRows.add(keyExtractor(row));
    } else {
      for (const row of paginatedData) selectedRows.delete(keyExtractor(row));
    }
    selectedRows = selectedRows;
    onSelectionChange?.([...selectedRows]);
  }

  function toggleRowSelection(row: T) {
    const key = keyExtractor(row);
    if (selectedRows.has(key)) {
      selectedRows.delete(key);
      selectAll = false;
    } else {
      selectedRows.add(key);
    }
    selectedRows = selectedRows;
    onSelectionChange?.([...selectedRows]);
  }

  function clearFilters() {
    activeFilters = {};
    searchQuery = "";
    currentPage = 1;
    if (serverSide) {
      lastEmittedSearchQuery = "";
      onSearch?.("");
      for (const filter of filters) onFilterChange?.(filter.key, "");
      onPageChange?.(1);
    }
  }

  function applyFilter(key: string, value: string) {
    if (activeFilters[key] === value) return;
    activeFilters = { ...activeFilters, [key]: value };
    currentPage = 1;
    if (serverSide) {
      onPageChange?.(1);
    }
    onFilterChange?.(key, value);
  }

  function getEventValue(event: Event) {
    return String(
      (event.currentTarget as HTMLInputElement | HTMLSelectElement | null)
        ?.value ?? "",
    );
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      onPageChange?.(page);
    }
  }

  function handlePageSizeChange(value: string) {
    currentPageSize = Number(value) || pageSize;
    currentPage = 1;
    onPageSizeChange?.(currentPageSize);
    onPageChange?.(1);
  }

  function getCellValue(row: T, column: Column<T>): string {
    const value = getRowRecord(row)[column.key];
    if (column.formatter) {
      return column.formatter(value as never, row);
    }
    return value != null ? String(value) : "-";
  }

  const HTML_TAG_RE = /<[^>]+>/;

  function isHtmlContent(value: string) {
    return HTML_TAG_RE.test(value);
  }

  $: pageSizeValue = String(currentPageSize);
  $: activeFilterCount = Object.values(activeFilters).reduce(
    (total: number, value) => total + (value !== "" && value != null ? 1 : 0),
    0,
  );
  $: skeletonRowCount = Math.max(4, Math.min(Number(currentPageSize) || 6, 8));
  $: tableColumnCount =
    columns.length +
    (selectable ? 1 : 0) +
    ($$slots["row-actions"] || $$slots.actions || $$slots["row-actions-cell"] ? 1 : 0);
</script>

<Card class="datatable-card overflow-hidden" padding="none">
  {#if title || searchable || filterable || exportable || $$slots["row-actions-cell"]}
    <div
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-5 pt-4 pb-4"
    >
      {#if title}
        <h3 class="text-lg font-semibold text-slate-900">{title}</h3>
      {/if}

      <div class="flex flex-wrap items-center gap-2">
        {#if searchable}
          <FieldInput
            label={title ? `Buscar em ${title}` : "Buscar na tabela"}
            srLabel={true}
            placeholder="Buscar..."
            bind:value={searchQuery}
            icon={Search}
            class_name="w-full sm:w-72"
          />
        {/if}

        {#if filterable && filters.length > 0}
          <Button
            variant="secondary"
            on:click={() => (showFilterSheet = true)}
            ariaHaspopup="dialog"
            class_name={`sm:hidden ${activeFilterCount > 0 ? "vtur-button--active-filter" : ""}`}
          >
            <Filter size={16} class="mr-2" />
            Filtros
            {#if activeFilterCount > 0}
              <span
                class="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white"
              >
                {activeFilterCount}
              </span>
            {/if}
          </Button>
          <Button
            variant="secondary"
            on:click={() => (showFilters = !showFilters)}
            ariaExpanded={showFilters}
            ariaControls={filterPanelId}
            class_name={`hidden sm:inline-flex ${activeFilterCount > 0 ? "vtur-button--active-filter" : ""}`}
          >
            <Filter size={16} class="mr-2" />
            Filtros
            {#if activeFilterCount > 0}
              <span
                class="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white"
              >
                {activeFilterCount}
              </span>
            {/if}
          </Button>
        {/if}

        {#if exportable}
          <Button variant="ghost" on:click={() => onExport?.()}>
            <Download size={16} class="mr-2" />
            Exportar
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  {#if showFilters && filters.length > 0}
    <div id={filterPanelId} class="datatable-filter-panel vtur-filter-panel">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {#each filters as filter}
          {#if filter.type === "select"}
            <FieldSelect
              id={`filter-${filter.key}`}
              label={filter.label}
              value={String(activeFilters[filter.key] || "")}
              options={filter.options || []}
              placeholder="Todos"
              class_name="w-full"
              on:change={(event) =>
                applyFilter(filter.key, getEventValue(event))}
            />
          {:else}
            <FieldInput
              id={`filter-${filter.key}`}
              label={filter.label}
              type={filter.type === "date" ? "date" : "text"}
              value={String(activeFilters[filter.key] || "")}
              placeholder={`Filtrar ${filter.label.toLowerCase()}`}
              class_name="w-full"
              on:input={(event) =>
                applyFilter(filter.key, getEventValue(event))}
            />
          {/if}
        {/each}
      </div>
      <div class="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" on:click={clearFilters}>
          Limpar filtros
        </Button>
      </div>
    </div>
  {/if}

  {#if filterable && filters.length > 0}
    <BottomSheet bind:open={showFilterSheet} title="Filtros">
      <div class="space-y-4">
        {#each filters as filter}
          {#if filter.type === "select"}
            <FieldSelect
              id={`filter-${filter.key}-mobile`}
              label={filter.label}
              value={String(activeFilters[filter.key] || "")}
              options={filter.options || []}
              placeholder="Todos"
              class_name="w-full"
              on:change={(event) =>
                applyFilter(filter.key, getEventValue(event))}
            />
          {:else}
            <FieldInput
              id={`filter-${filter.key}-mobile`}
              label={filter.label}
              type={filter.type === "date" ? "date" : "text"}
              value={String(activeFilters[filter.key] || "")}
              placeholder={`Filtrar ${filter.label.toLowerCase()}`}
              class_name="w-full"
              on:input={(event) =>
                applyFilter(filter.key, getEventValue(event))}
            />
          {/if}
        {/each}

        <div class="flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            class_name="w-full justify-center"
            on:click={() => (showFilterSheet = false)}
          >
            Aplicar filtros
          </Button>
          <Button
            variant="ghost"
            class_name="w-full justify-center"
            on:click={clearFilters}
          >
            Limpar filtros
          </Button>
        </div>
      </div>
    </BottomSheet>
  {/if}

  <div class="vtur-table-shell">
    <div class="overflow-x-visible md:overflow-x-auto">
      <table class="w-full text-sm table-mobile-cards" aria-busy={loading ? "true" : undefined}>
        <caption class="sr-only">{title || "Registros"}</caption>
        <thead class="vtur-table__head">
          <tr>
            {#if selectable}
              <th class="w-10 px-4 py-3">
                <Checkbox
                  checked={selectAll}
                  {color}
                  ariaLabel="Selecionar todos os registros"
                  class_name="rounded border-slate-300"
                  on:change={toggleSelectAll}
                />
              </th>
            {/if}
            {#each columns as column}
              <th
                class={`px-6 py-3 text-left ${column.headerClass || ""}`}
                style={column.width ? `width: ${column.width}` : ""}
                aria-sort={column.sortable
                  ? sortKey === column.key && sortDirection === "asc"
                    ? "ascending"
                    : sortKey === column.key && sortDirection === "desc"
                      ? "descending"
                      : "none"
                  : undefined}
              >
                {#if column.sortable}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    class_name={`min-h-0! rounded-none! px-0! py-0! font-inherit text-inherit hover:bg-transparent! hover:text-slate-900! ${column.headerClass || ""}`}
                    ariaLabel={`Ordenar por ${column.label}`}
                    on:click={() => handleSort(column)}
                  >
                    {column.label}
                    {#if sortKey === column.key}
                      {#if sortDirection === "asc"}
                        <ArrowUp size={14} />
                      {:else if sortDirection === "desc"}
                        <ArrowDown size={14} />
                      {/if}
                    {:else}
                      <ArrowUpDown size={14} class="text-slate-400" />
                    {/if}
                  </Button>
                {:else}
                  {column.label}
                {/if}
              </th>
            {/each}
            {#if $$slots["row-actions"] || $$slots.actions || $$slots["row-actions-cell"]}
              <th class="px-6 py-3 text-right">Ações</th>
            {/if}
          </tr>
        </thead>
        <tbody class="vtur-table__body">
          {#if loading}
            <tr class="sr-only">
              <td colspan={tableColumnCount}
                >{loadingTitle}. {loadingMessage}</td
              >
            </tr>
            {#each Array(skeletonRowCount) as _, rowIndex}
              <tr class="animate-pulse">
                {#if selectable}
                  <td class="px-4 py-2">
                    <div
                      class="h-4 w-4 rounded-sm border border-slate-200 bg-slate-100"
                    ></div>
                  </td>
                {/if}
                {#each columns as column, colIndex}
                  <td class="px-6 py-2" data-label={column.label}>
                    <div
                      class={`h-3 rounded-full bg-slate-100 ${skeletonWidths[(rowIndex + colIndex) % skeletonWidths.length]}`}
                    ></div>
                  </td>
                {/each}
                {#if $$slots["row-actions"] || $$slots.actions || $$slots["row-actions-cell"]}
                  <td class="px-6 py-2">
                    <div class="ml-auto h-8 w-20 rounded-lg bg-slate-100"></div>
                  </td>
                {/if}
              </tr>
            {/each}
          {:else if paginatedData.length === 0}
            <tr>
              <td
                colspan={tableColumnCount}
                class="px-6 py-12 text-center text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          {:else}
            {#each paginatedData as row (keyExtractor(row))}
              <tr
                class={`transition-colors hover:bg-slate-50/90 ${onRowClick ? "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500" : ""} ${rowClass?.(row) || ""}`}
                class:cursor-pointer={onRowClick}
                tabindex={onRowClick ? 0 : undefined}
                on:click={() => onRowClick?.(row)}
                on:keydown={(event) => {
                  // Só a própria linha: Enter/Espaço em botões e campos internos seguem o comportamento deles.
                  if (!onRowClick || event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(row);
                  }
                }}
              >
                {#if selectable}
                  <td class="px-4 py-3" on:click|stopPropagation>
                    <Checkbox
                      checked={selectedRows.has(keyExtractor(row))}
                      {color}
                      ariaLabel={`Selecionar linha ${keyExtractor(row)}`}
                      class_name="rounded border-slate-300"
                      on:change={() => toggleRowSelection(row)}
                    />
                  </td>
                {/if}
                {#each columns as column}
                  <td
                    class={`px-6 whitespace-nowrap text-sm text-slate-900 ${compact ? 'py-1.5 leading-tight' : dense ? 'py-2' : 'py-3'} ${column.cellClass || ""}`}
                    data-label={column.label}
                  >
                    {#if column.component}
                      <svelte:component
                        this={column.component}
                        {...column.componentProps?.(row) || {}}
                      />
                    {:else}
                      {@const cellValue = getCellValue(row, column)}
                      {#if isHtmlContent(cellValue)}
                        <SanitizedHtml html={cellValue} />
                      {:else}
                        {cellValue}
                      {/if}
                    {/if}
                  </td>
                {/each}
                {#if $$slots["row-actions"] || $$slots.actions || $$slots["row-actions-cell"]}
                  <td
                    class="px-6 py-3 text-right td-actions"
                    on:click|stopPropagation
                  >
                    <slot name="row-actions" {row} />
                    <slot name="actions" {row} />
                    <slot name="row-actions-cell" {row} />
                  </td>
                {/if}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Fase 5.2: anuncia ao leitor de tela quantos registros a busca/filtro encontrou. -->
    {#if !loading && (searchQuery.trim() !== "" || activeFilterCount > 0)}
      <p class="sr-only" role="status" aria-live="polite">
        {totalRecords === 1 ? "1 registro encontrado" : `${totalRecords} registros encontrados`}
      </p>
    {/if}

    {#if showRowCount && pagination && totalRecords > 0}
      <div class="vtur-table-pagination">
        <div class="text-sm text-slate-500">
          Mostrando <span class="font-medium">{startIndex}</span> a
          <span class="font-medium">{endIndex}</span>
          de <span class="font-medium">{totalRecords}</span> registros
        </div>

        <div class="flex items-center gap-4">
          <FieldSelect
            label="Itens por página"
            srLabel={true}
            value={pageSizeValue}
            options={pageSizeOptions.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
            placeholder={null}
            class_name="w-20"
            on:change={(event) => handlePageSizeChange(getEventValue(event))}
          />

          <div class="flex items-center gap-1">
            <Button
              on:click={() => goToPage(1)}
              disabled={currentPage === 1}
              variant="ghost"
              size="xs"
              class_name="h-9 w-9 p-0!"
              ariaLabel="Primeira página"
            >
              <ChevronsLeft size={16} />
            </Button>
            <Button
              on:click={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              variant="ghost"
              size="xs"
              class_name="h-9 w-9 p-0!"
              ariaLabel="Página anterior"
            >
              <ChevronLeft size={16} />
            </Button>
            <span class="px-3 py-1 text-sm" aria-live="polite"
              >Página {currentPage} de {totalPages}</span
            >
            <Button
              on:click={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              variant="ghost"
              size="xs"
              class_name="h-9 w-9 p-0!"
              ariaLabel="Próxima página"
            >
              <ChevronRight size={16} />
            </Button>
            <Button
              on:click={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              variant="ghost"
              size="xs"
              class_name="h-9 w-9 p-0!"
              ariaLabel="Última página"
            >
              <ChevronsRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</Card>
