/**
 * Sistema de cores do VTUR por módulo
 * Mantém a identidade visual do sistema original
 */

export type ModuleColor =
  | 'clientes'
  | 'orcamentos'
  | 'operacao'
  | 'financeiro'
  | 'vendas'
  | 'comissoes'
  | 'default';

export interface ColorScheme {
  primary: string;
  primaryLight: string;
  primaryBorder: string;
  primaryDark: string;
  primary50: string;
  primary100: string;
  primary200: string;
  primary300: string;
  primary400: string;
  primary500: string;
  primary600: string;
  primary700: string;
  primary800: string;
  primary900: string;
}

export const MODULE_COLORS: Record<ModuleColor, ColorScheme> = {
  clientes: {
    primary: '#2563eb',
    primaryLight: '#ebf8ff',
    primaryBorder: '#bfdbfe',
    primaryDark: '#1d4ed8',
    primary50: '#ebf8ff',
    primary100: '#bfdbfe',
    primary200: '#93c5fd',
    primary300: '#60a5fa',
    primary400: '#3b82f6',
    primary500: '#2563eb',
    primary600: '#1d4ed8',
    primary700: '#1e40af',
    primary800: '#1e3a8a',
    primary900: '#172554'
  },
  orcamentos: {
    primary: '#2563eb',
    primaryLight: '#ebf8ff',
    primaryBorder: '#bfdbfe',
    primaryDark: '#1d4ed8',
    primary50: '#ebf8ff',
    primary100: '#bfdbfe',
    primary200: '#93c5fd',
    primary300: '#60a5fa',
    primary400: '#3b82f6',
    primary500: '#2563eb',
    primary600: '#1d4ed8',
    primary700: '#1e40af',
    primary800: '#1e3a8a',
    primary900: '#172554'
  },
  operacao: {
    primary: '#0d9488',
    primaryLight: '#f0fdfa',
    primaryBorder: '#99f6e4',
    primaryDark: '#0f766e',
    primary50: '#f0fdfa',
    primary100: '#ccfbf1',
    primary200: '#99f6e4',
    primary300: '#5eead4',
    primary400: '#2dd4bf',
    primary500: '#14b8a6',
    primary600: '#0d9488',
    primary700: '#0f766e',
    primary800: '#115e59',
    primary900: '#134e4a'
  },
  financeiro: {
    primary: '#f97316',
    primaryLight: '#fff7ed',
    primaryBorder: '#fed7aa',
    primaryDark: '#c2410c',
    primary50: '#fff7ed',
    primary100: '#ffedd5',
    primary200: '#fed7aa',
    primary300: '#fdba74',
    primary400: '#fb923c',
    primary500: '#f97316',
    primary600: '#ea580c',
    primary700: '#c2410c',
    primary800: '#9a3412',
    primary900: '#7c2d12'
  },
  comissoes: {
    primary: '#f97316',
    primaryLight: '#fff7ed',
    primaryBorder: '#fed7aa',
    primaryDark: '#c2410c',
    primary50: '#fff7ed',
    primary100: '#ffedd5',
    primary200: '#fed7aa',
    primary300: '#fdba74',
    primary400: '#fb923c',
    primary500: '#f97316',
    primary600: '#ea580c',
    primary700: '#c2410c',
    primary800: '#9a3412',
    primary900: '#7c2d12'
  },
  vendas: {
    primary: '#16a34a',
    primaryLight: '#ecfdf3',
    primaryBorder: '#bbf7d0',
    primaryDark: '#15803d',
    primary50: '#ecfdf3',
    primary100: '#d1fae5',
    primary200: '#bbf7d0',
    primary300: '#86efac',
    primary400: '#4ade80',
    primary500: '#22c55e',
    primary600: '#16a34a',
    primary700: '#15803d',
    primary800: '#166534',
    primary900: '#14532d'
  },
  default: {
    primary: '#2563eb',
    primaryLight: '#ebf8ff',
    primaryBorder: '#bfdbfe',
    primaryDark: '#1d4ed8',
    primary50: '#ebf8ff',
    primary100: '#bfdbfe',
    primary200: '#93c5fd',
    primary300: '#60a5fa',
    primary400: '#3b82f6',
    primary500: '#2563eb',
    primary600: '#1d4ed8',
    primary700: '#1e40af',
    primary800: '#1e3a8a',
    primary900: '#172554'
  }
};

/**
 * Determina a cor do módulo baseado na rota atual
 */
export function getModuleColorFromPath(path: string): ModuleColor {
  if (path.startsWith('/clientes')) return 'clientes';
  if (path.startsWith('/orcamentos')) return 'orcamentos';
  if (path.startsWith('/financeiro') || path.startsWith('/parametros')) return 'financeiro';
  if (path.startsWith('/vendas')) return 'vendas';
  if (path.startsWith('/operacao')) return 'operacao';
  return 'default';
}

/**
 * Retorna o scheme de cores completo para um módulo
 */
export function getColorScheme(module: ModuleColor): ColorScheme {
  return MODULE_COLORS[module] || MODULE_COLORS.default;
}

/**
 * Cores semânticas do sistema
 */
export const SEMANTIC_COLORS = {
  success: {
    DEFAULT: '#16a34a',
    light: '#ecfdf3',
    dark: '#15803d'
  },
  warning: {
    DEFAULT: '#f97316',
    light: '#fff7ed',
    dark: '#c2410c'
  },
  danger: {
    DEFAULT: '#dc2626',
    light: '#fef2f2',
    dark: '#b91c1c'
  },
  info: {
    DEFAULT: '#2563eb',
    light: '#ebf8ff',
    dark: '#1d4ed8'
  }
} as const;
