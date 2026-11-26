// Ambiente dos testes *.dom.test.ts (jsdom).
// O jsdom não implementa matchMedia; alguns componentes (Flowbite, layout) consultam na montagem.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    }
  })) as unknown as typeof window.matchMedia;
}

// O jsdom também não implementa CSS.escape (usado pela CommandPalette para localizar a opção ativa).
if (typeof window !== 'undefined' && !(window.CSS && window.CSS.escape)) {
  window.CSS = window.CSS || ({} as typeof CSS);
  window.CSS.escape = (valor: string) => valor.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

// scrollIntoView não existe no jsdom (CommandPalette rola a opção ativa para a vista).
if (typeof window !== 'undefined' && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = () => {};
}

// DataTransfer não existe no jsdom (FileDropzone monta a FileList dos arquivos aceitos com ele).
if (typeof window !== 'undefined' && typeof window.DataTransfer === 'undefined') {
  class DataTransferTeste {
    private lista: File[] = [];
    readonly items = {
      add: (file: File) => {
        this.lista.push(file);
        return null;
      }
    };
    get files(): FileList {
      const lista = [...this.lista];
      return Object.assign(lista, { item: (i: number) => lista[i] ?? null }) as unknown as FileList;
    }
  }
  (window as unknown as { DataTransfer: unknown }).DataTransfer = DataTransferTeste;
  (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = DataTransferTeste;
}
