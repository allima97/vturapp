/**
 * Mapa semântico ação → ícone (padrão canônico, docs/padronizacao/etapa-2 §3).
 *
 * Toda ação recorrente do app deve usar o ícone deste mapa — nunca escolher
 * um ícone solto por tela. Ex.:
 * ```svelte
 * <script>
 *   import { actionIcons } from '$lib/icons/actions';
 * </script>
 * <Button ariaLabel="Excluir"><svelte:component this={actionIcons.delete} class="h-4 w-4" /></Button>
 * ```
 */
import AlertCircle from './AlertCircle.svelte';
import AlertTriangle from './AlertTriangle.svelte';
import ArrowLeft from './ArrowLeft.svelte';
import CheckCircle2 from './CheckCircle2.svelte';
import Download from './Download.svelte';
import Eye from './Eye.svelte';
import Filter from './Filter.svelte';
import Paperclip from './Paperclip.svelte';
import Pencil from './Pencil.svelte';
import Plus from './Plus.svelte';
import Search from './Search.svelte';
import Send from './Send.svelte';
import Trash2 from './Trash2.svelte';
import Whatsapp from './Whatsapp.svelte';
import X from './X.svelte';

export const actionIcons = {
  edit: Pencil,
  add: Plus,
  delete: Trash2,
  view: Eye,
  download: Download,
  filter: Filter,
  search: Search,
  close: X,
  back: ArrowLeft,
  send: Send,
  attach: Paperclip,
  whatsapp: Whatsapp,
  warning: AlertTriangle,
  success: CheckCircle2,
  error: AlertCircle
} as const;

export type ActionIconName = keyof typeof actionIcons;
