<script context="module" lang="ts">
  import type { Config as DOMPurifyConfig } from 'dompurify';

  const BLANK_TARGET_LINK_RE = /<a([^>]*\starget="_blank"[^>]*)>/gi;
  const REL_ATTRIBUTE_RE = /\srel=/i;
  const DOMPURIFY_CONFIG: DOMPurifyConfig = {
    ALLOWED_TAGS: [
      'a',
      'span',
      'div',
      'p',
      'strong',
      'em',
      'img',
      'small',
      'br',
      'svg',
      'path',
      'circle',
      'rect',
      'line',
      'polyline',
      'polygon'
    ],
    ALLOWED_ATTR: [
      'aria-label',
      'alt',
      'class',
      'style',
      'd',
      'fill',
      'height',
      'href',
      'rel',
      'role',
      'src',
      'stroke',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-width',
      'target',
      'title',
      'viewBox',
      'width'
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|blob):|\/|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORCE_BODY: false
  };

  let purifierPromise: Promise<typeof import('dompurify')> | null = null;

  function loadPurifier() {
    purifierPromise ??= import('dompurify');
    return purifierPromise;
  }

  async function sanitizeHtmlContent(value: string): Promise<string> {
    if (typeof window === 'undefined') return '';

    try {
      const { default: DOMPurify } = await loadPurifier();
      const clean = String(DOMPurify.sanitize(String(value || ''), DOMPURIFY_CONFIG));
      return clean.replace(BLANK_TARGET_LINK_RE, (match: string, attrs: string) => {
        if (REL_ATTRIBUTE_RE.test(attrs)) return match;
        return `<a${attrs} rel="noopener noreferrer">`;
      });
    } catch {
      return '';
    }
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  export let html = '';

  let mounted = false;
  let sanitized = '';
  let sanitizeSeq = 0;

  async function refreshSanitizedHtml(value: string) {
    const seq = ++sanitizeSeq;
    const clean = await sanitizeHtmlContent(value);
    if (mounted && seq === sanitizeSeq) {
      sanitized = clean;
    }
  }

  $: if (mounted) {
    void refreshSanitizedHtml(html);
  }

  onMount(() => {
    mounted = true;
    return () => {
      mounted = false;
      sanitizeSeq += 1;
    };
  });
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- o conteúdo passa por sanitize (DOMPurify) antes de renderizar -->
{@html sanitized}
