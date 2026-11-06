import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { ModuleColor } from '$lib/theme/colors';

// ========== Sidebar Store ==========
interface SidebarState {
  isOpen: boolean;
  isMobile: boolean;
}

function createSidebarStore() {
  const { subscribe, set, update } = writable<SidebarState>({
    isOpen: false,
    isMobile: false
  });

  return {
    subscribe,

    toggle: () => {
      update((state) => ({ ...state, isOpen: !state.isOpen }));
    },

    open: () => {
      update((state) => ({ ...state, isOpen: true }));
    },

    close: () => {
      update((state) => ({ ...state, isOpen: false }));
    },

    setMobile: (isMobile: boolean) => {
      update((state) => ({ ...state, isMobile, isOpen: isMobile ? false : state.isOpen }));
    }
  };
}

export const sidebar = createSidebarStore();

// ========== Theme Store ==========
interface ThemeState {
  moduleColor: ModuleColor;
}

function createThemeStore() {
  const { subscribe, set, update } = writable<ThemeState>({
    moduleColor: 'default'
  });

  return {
    subscribe,

    setModuleColor: (color: ModuleColor) => {
      update((state) => ({ ...state, moduleColor: color }));
    },

    reset: () => {
      set({ moduleColor: 'default' });
    }
  };
}

export const theme = createThemeStore();

// ========== Toast/Notification Store ==========
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function add(message: string, type: Toast['type'] = 'info', duration = 5000) {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: Toast = { id, message, type, duration };

    update((toasts) => [...toasts, toast]);

    if (duration > 0) {
      setTimeout(() => remove(id), duration);
    }

    return id;
  }

  function remove(id: string) {
    update((toasts) => toasts.filter((t) => t.id !== id));
  }

  return {
    subscribe,
    add,
    remove,
    success: (message: string, duration?: number) => add(message, 'success', duration),
    error: (message: string, duration?: number) => add(message, 'error', duration),
    warning: (message: string, duration?: number) => add(message, 'warning', duration),
    info: (message: string, duration?: number) => add(message, 'info', duration)
  };
}

export const toast = createToastStore();

// ========== Page Loading Store ==========
function createPageLoadingStore() {
  const { subscribe, set } = writable(false);

  return {
    subscribe,
    start: () => set(true),
    stop: () => set(false)
  };
}

export const pageLoading = createPageLoadingStore();

// ========== Mobile Detection ==========
export const isMobile = derived(sidebar, ($sidebar) => $sidebar.isMobile);

// ========== Window Size ==========
function createWindowSizeStore() {
  const { subscribe, set } = writable({ width: 0, height: 0 });

  if (browser) {
    const handleResize = () => {
      set({
        width: window.innerWidth,
        height: window.innerHeight
      });
      sidebar.setMobile(window.innerWidth < 1024);
    };

    // Initial size
    handleResize();

    window.addEventListener('resize', handleResize);
  }

  return {
    subscribe
  };
}

export const windowSize = createWindowSizeStore();
