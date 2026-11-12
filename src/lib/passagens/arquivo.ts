import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ocrWorkerUrl from 'tesseract.js/dist/worker.min.js?url';
import ocrCoreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import { base } from '$app/paths';

const LIMITE_BYTES = 10 * 1024 * 1024;
const LIMITE_PAGINAS = 10;

export async function extrairTextoArquivo(
  arquivo: File,
  progresso: (mensagem: string) => void = () => {}
) {
  if (!arquivo.size || arquivo.size > LIMITE_BYTES) {
    throw new Error('Selecione um arquivo não vazio de até 10 MB.');
  }
  const isPdf = arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name);
  const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type);
  if (!isPdf && !isImage) throw new Error('Selecione um PDF ou uma imagem PNG, JPEG ou WebP.');

  let ocr: import('tesseract.js').Worker | undefined;
  async function reconhecer(imagem: Blob | HTMLCanvasElement) {
    progresso('Preparando reconhecimento de imagem...');
    if (!ocr) {
      const langPath = `${location.origin}${base}/ocr`;
      const resposta = await fetch(`${langPath}/por.traineddata.gz`, {
        credentials: 'same-origin'
      });
      if (!resposta.ok || resposta.headers.get('content-type')?.includes('text/html')) {
        throw new Error(
          'Não foi possível carregar o idioma do reconhecimento. Verifique sua conexão e sessão.'
        );
      }
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      ocr = await createWorker('por', OEM.LSTM_ONLY, {
        workerPath: ocrWorkerUrl,
        corePath: ocrCoreUrl,
        langPath,
        cacheMethod: 'none'
      });
      await ocr.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1'
      });
    }
    progresso('Reconhecendo texto da imagem...');
    return (await ocr.recognize(imagem)).data.text;
  }

  try {
    if (isImage) {
      const bitmap = await createImageBitmap(arquivo);
      try {
        if (bitmap.width * bitmap.height > 25_000_000)
          throw new Error('A imagem é grande demais para processamento.');
        const escala = Math.min(3, Math.sqrt(25_000_000 / (bitmap.width * bitmap.height)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * escala);
        canvas.height = Math.round(bitmap.height * escala);
        const contexto = canvas.getContext('2d');
        if (!contexto) throw new Error('Não foi possível processar a imagem neste navegador.');
        contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return await reconhecer(canvas);
      } finally {
        bitmap.close();
      }
    }

    progresso('Lendo PDF...');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const documento = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    try {
      if (documento.numPages > LIMITE_PAGINAS)
        throw new Error('O PDF deve ter no máximo 10 páginas.');
      const paginas: string[] = [];
      for (let numero = 1; numero <= documento.numPages; numero++) {
        progresso(`Lendo página ${numero} de ${documento.numPages}...`);
        const pagina = await documento.getPage(numero);
        const conteudo = await pagina.getTextContent();
        const linhas: string[] = [];
        let linha = '';
        let y: number | undefined;
        for (const item of conteudo.items) {
          if (!('str' in item)) continue;
          if (y !== undefined && Math.abs(y - item.transform[5]) > 3 && linha.trim()) {
            linhas.push(linha.trimEnd());
            linha = '';
          }
          linha += item.str + (item.hasEOL ? '\n' : ' ');
          y = item.transform[5];
        }
        if (linha.trim()) linhas.push(linha.trimEnd());
        let texto = linhas.join('\n');
        if (texto.trim().length < 30) {
          const viewport = pagina.getViewport({ scale: 3 });
          if (viewport.width * viewport.height > 25_000_000)
            throw new Error('A página do PDF é grande demais para processamento.');
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const contexto = canvas.getContext('2d');
          if (!contexto) throw new Error('Não foi possível processar o PDF neste navegador.');
          await pagina.render({ canvasContext: contexto, viewport, canvas }).promise;
          texto = await reconhecer(canvas);
        }
        paginas.push(texto);
        pagina.cleanup();
      }
      return paginas.join('\n');
    } finally {
      await documento.destroy();
    }
  } finally {
    if (ocr) await ocr.terminate();
  }
}
