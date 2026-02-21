import { create } from 'zustand';

interface AIStoreState {
    isOpen: boolean;
    isCallActive: boolean;
    toggleChat: () => void;
    closeChat: () => void;
    setCallActive: (status: boolean) => void;
}

export const useAIStore = create<AIStoreState>((set) => ({
    isOpen: false,
    isCallActive: false,
    toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
    closeChat: () => set({ isOpen: false }),
    setCallActive: (status: boolean) => set({ isCallActive: status }),
}));
