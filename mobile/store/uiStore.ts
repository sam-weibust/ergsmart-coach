import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

type ActiveTab = 'index' | 'training' | 'performance' | 'teams' | 'more';

interface UiState {
  activeTab: ActiveTab;
  isLoading: boolean;
  toasts: ToastMessage[];
  modalVisible: boolean;
  modalContent: string | null;

  // Actions
  setActiveTab: (tab: ActiveTab) => void;
  setLoading: (loading: boolean) => void;
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
  hideToast: (id: string) => void;
  clearToasts: () => void;
  openModal: (content: string) => void;
  closeModal: () => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'index',
  isLoading: false,
  toasts: [],
  modalVisible: false,
  modalContent: null,

  setActiveTab: (activeTab) => set({ activeTab }),

  setLoading: (isLoading) => set({ isLoading }),

  showToast: (message, variant = 'info', duration = 3000) => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant, duration }],
    }));

    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },

  hideToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearToasts: () => set({ toasts: [] }),

  openModal: (content) => set({ modalVisible: true, modalContent: content }),

  closeModal: () => set({ modalVisible: false, modalContent: null }),
}));
