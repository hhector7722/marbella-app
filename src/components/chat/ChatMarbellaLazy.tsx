'use client';

import dynamic from 'next/dynamic';

const ChatMarbella = dynamic(() => import('@/components/chat/ChatMarbella'), {
    ssr: false,
});

export default function ChatMarbellaLazy() {
    return <ChatMarbella />;
}
