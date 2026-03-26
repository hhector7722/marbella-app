export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AgentRequest {
  query: string;
  userId: string;
  userRole: 'staff' | 'manager';
}

export interface AgentResponse {
  response: string;
  actionPerformed?: {
    type: string;
    details: unknown;
  };
  metadata: {
    processingTimeMs: number;
    queryType: string;
  };
}

export interface ParsedQuery {
  type: 'sales' | 'labor' | 'order' | 'recipe' | 'table' | 'treasury' | 'unknown';
  action?: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

